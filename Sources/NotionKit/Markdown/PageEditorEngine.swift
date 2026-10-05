import Foundation
import Observation
import os

/// The editor's save state, shown in the page footer.
public enum EditorSyncStatus: Equatable, Sendable {
    case saved
    case saving
    case offline(String)
    case error(String)

    public var label: String {
        switch self {
        case .saved: return "Saved"
        case .saving: return "Saving…"
        case .offline: return "Offline. Will retry."
        case .error(let message): return message
        }
    }
}

/// Loads a Notion page into an `EditorDocument` (one paragraph per block) and keeps Notion in
/// sync with it by exact block identity:
///
/// every character edit (through the document's NSTextStorage delegate — the same path for the
/// NSTextView, paste, undo and tests) → `noteLocalEdit` → 700 ms debounce → `syncNow`:
/// `EditorSyncPlanner.plan(previous, document.paragraphs())` → ops run sequentially (inserts via
/// `NotionClient.appendBlocks` so the new ids come straight back and are stamped onto their
/// paragraphs; updates/deletes via `WriteQueue`). `previous` only ever moves on confirmed
/// results, so a failed or interrupted pass is simply re-planned next time. Every op and failure
/// is logged (`log show --predicate 'subsystem == "cz.stepanblaha.notiondock"'`).
@MainActor
@Observable
public final class PageEditorEngine {
    public let pageId: String
    public let document: EditorDocument

    public private(set) var status: EditorSyncStatus = .saved
    public private(set) var isLoading = false
    /// The editor is only editable once the server state is known (edits need a `previous`).
    public private(set) var hasLoaded = false
    public var errorMessage: String?
    /// Set when a sync was held back because it would delete most of the page.
    public private(set) var pendingMassDelete: Int?
    public private(set) var restoredTokenHint: String?
    public private(set) var isDocumentEmpty = true
    /// The page's cover image, if it has one (`GET /v1/pages/{id}`).
    public private(set) var cover: FileRef?

    /// Bytes of a Notion-hosted image (the app's disk cache), used to re-upload a moved image.
    @ObservationIgnored public var imageDataProvider: (@Sendable (URL) async -> Data?)?
    /// Called after an image upload completes (upload id, bytes), so the app can show it at once.
    @ObservationIgnored public var onImageUploaded: (@MainActor (String, Data) -> Void)?

    /// Last server-confirmed page state, pre-order.
    @ObservationIgnored public private(set) var previous: [SyncedParagraph] = []

    @ObservationIgnored let client: NotionClient
    @ObservationIgnored private let writeQueue: WriteQueue
    @ObservationIgnored private let cache: Cache?
    @ObservationIgnored private let cacheKey: String
    @ObservationIgnored private let debounceNanos: UInt64
    @ObservationIgnored private let pollNanos: UInt64
    @ObservationIgnored private let remoteQuietPeriod: TimeInterval
    @ObservationIgnored private let retryNanos: UInt64

    @ObservationIgnored private var debounceTask: Task<Void, Never>?
    @ObservationIgnored private var retryTask: Task<Void, Never>?
    @ObservationIgnored private var pollTask: Task<Void, Never>?
    @ObservationIgnored private var loadTask: Task<Void, Never>?
    @ObservationIgnored private var hintTask: Task<Void, Never>?
    @ObservationIgnored public private(set) var isSyncing = false
    @ObservationIgnored private var syncAgain = false
    @ObservationIgnored private var syncedGeneration = 0
    @ObservationIgnored private var lastPassFailed = false
    @ObservationIgnored private var massDeleteConfirmed = false

    static let log = Logger(subsystem: "cz.stepanblaha.notiondock", category: "sync")
    static let cacheKind = "editor-doc"

    public init(
        pageId: String,
        client: NotionClient,
        writeQueue: WriteQueue,
        cache: Cache? = nil,
        cacheKey: String? = nil,
        document: EditorDocument? = nil,
        debounce: TimeInterval = 0.7,
        pollInterval: TimeInterval = 45,
        remoteQuietPeriod: TimeInterval = 5,
        retryInterval: TimeInterval = 15
    ) {
        self.pageId = pageId
        self.client = client
        self.writeQueue = writeQueue
        self.cache = cache
        self.cacheKey = cacheKey ?? pageId
        self.document = document ?? EditorDocument()
        self.debounceNanos = UInt64(debounce * 1_000_000_000)
        self.pollNanos = UInt64(pollInterval * 1_000_000_000)
        self.remoteQuietPeriod = remoteQuietPeriod
        self.retryNanos = UInt64(retryInterval * 1_000_000_000)
        self.document.onLocalEdit = { [weak self] in self?.noteLocalEdit() }
    }

    /// Anything typed that isn't confirmed by Notion yet (or a sync still running).
    public var hasUnsyncedChanges: Bool {
        debounceTask != nil || isSyncing || lastPassFailed || document.editGeneration != syncedGeneration
    }

    // MARK: - Loading

    /// Idempotent: the first call loads (instant paint from cache, then the server); concurrent
    /// calls share it; later calls are a normal remote refresh (never clobbering local edits).
    public func load() async {
        if let loadTask { await loadTask.value; return }
        if hasLoaded { await refreshFromServer(); return }
        let task = Task { await self.performInitialLoad() }
        loadTask = task
        await task.value
        loadTask = nil
    }

    private func performInitialLoad() async {
        if previous.isEmpty, let cached = cache?.load([SyncedParagraph].self, forPin: cacheKey, kind: Self.cacheKind), !cached.isEmpty {
            document.load(cached, preserveSelection: false)
            markRebuilt()
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let fetched = try await fetchDocument()
            previous = fetched
            document.load(fetched, preserveSelection: true)
            markRebuilt()
            saveCache()
            hasLoaded = true
            errorMessage = nil
            await refreshPageMeta()
            Self.log.info("loaded page \(self.pageId, privacy: .public): \(fetched.count) blocks")
        } catch {
            errorMessage = Self.humanMessage(for: error)
            Self.log.error("load failed for page \(self.pageId, privacy: .public): \(String(describing: error), privacy: .public)")
        }
    }

    private func markRebuilt() {
        syncedGeneration = document.editGeneration
        updateEmpty()
    }

    /// Fetches the page as a pre-order block list: top-level blocks plus nested children of
    /// text blocks, up to depth 3. Errors propagate (a partial document must never become
    /// `previous`, or the next sync would "delete" what it didn't see).
    public func fetchDocument() async throws -> [SyncedParagraph] {
        var out: [SyncedParagraph] = []
        try await appendChildren(of: pageId, parentID: nil, depth: 0, into: &out)
        return out
    }

    private func appendChildren(of id: String, parentID: String?, depth: Int, into out: inout [SyncedParagraph]) async throws {
        let blocks = try await client.blockChildren(id)
        for block in blocks {
            let kind = Self.kind(of: block)
            let expand = block.hasChildren && kind.canHaveChildren && depth < ParagraphSyntax.maxDepth
            out.append(SyncedParagraph(
                blockID: block.id,
                parentID: parentID,
                kind: kind,
                spans: Self.spans(of: block, kind: kind),
                hasHiddenChildren: block.hasChildren && !expand && !kind.isToken
            ))
            if expand {
                try await appendChildren(of: block.id, parentID: block.id, depth: depth + 1, into: &out)
            }
        }
    }

    // MARK: - Page meta (cover)

    /// Re-reads the page's cover/icon. Failures are logged, never fatal for the editor.
    @discardableResult
    public func refreshPageMeta() async -> FileRef? {
        do {
            let meta = try await client.retrievePage(pageId)
            if meta.cover != cover { cover = meta.cover }
            return meta.cover
        } catch {
            Self.log.error("page meta failed: \(String(describing: error), privacy: .public)")
            return cover
        }
    }

    // MARK: - Remote refresh

    public func startPolling() {
        pollTask?.cancel()
        let interval = pollNanos
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: interval)
                if Task.isCancelled { return }
                await self?.refreshFromServer()
            }
        }
    }

    /// Stops polling and flushes any pending edit right away.
    public func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
        flush()
    }

    /// Applies server changes — only when the user is idle (no edit for 5 s), nothing is being
    /// synced, and there are no unsynced local changes; preserves the caret by block id + offset.
    public func refreshFromServer() async {
        guard hasLoaded else { await load(); return }
        guard canApplyRemote else { Self.log.debug("refresh skipped: local activity"); return }
        let generation = document.editGeneration
        do {
            let fetched = try await fetchDocument()
            await refreshPageMeta()
            guard canApplyRemote, document.editGeneration == generation else {
                Self.log.debug("refresh dropped: edited while fetching")
                return
            }
            let pending = EditorSyncPlanner.plan(previous: previous, current: document.paragraphs()).filter { !$0.isRestore }
            guard pending.isEmpty else {
                Self.log.info("refresh deferred: \(pending.count) unsynced local ops")
                scheduleSync()
                return
            }
            if Self.comparable(fetched) != Self.comparable(previous) {
                previous = fetched
                document.load(fetched, preserveSelection: true)
                markRebuilt()
                saveCache()
                Self.log.info("applied remote changes: \(fetched.count) blocks")
            }
            errorMessage = nil
        } catch {
            Self.log.error("refresh failed: \(String(describing: error), privacy: .public)")
            errorMessage = Self.humanMessage(for: error)
        }
    }

    private var canApplyRemote: Bool {
        !isSyncing && debounceTask == nil
            && Date().timeIntervalSince(document.lastLocalEditAt ?? .distantPast) >= remoteQuietPeriod
    }

    // MARK: - Local edits → debounced sync

    /// Called by the document for every character edit.
    public func noteLocalEdit() {
        updateEmpty()
        guard hasLoaded else { return }
        if status != .saving { status = .saving }
        scheduleSync()
    }

    private func scheduleSync() {
        debounceTask?.cancel()
        let delay = debounceNanos
        debounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: delay)
            guard !Task.isCancelled, let self else { return }
            self.debounceTask = nil
            await self.syncNow()
        }
    }

    /// Cancels the debounce and syncs now (fire-and-forget) if anything is unsynced.
    public func flush() {
        guard hasLoaded, hasUnsyncedChanges else { return }
        debounceTask?.cancel()
        debounceTask = nil
        Task { await self.syncNow() }
    }

    public func confirmMassDelete() {
        massDeleteConfirmed = true
        Task { await syncNow() }
    }

    /// Runs sync passes until the document matches the confirmed server state (or a pass fails).
    /// A call while a pass is running makes that run do one more pass — never dropped.
    public func syncNow() async {
        debounceTask?.cancel()
        debounceTask = nil
        guard hasLoaded else { Self.log.info("sync skipped: page not loaded"); return }
        if isSyncing {
            syncAgain = true
            return
        }
        isSyncing = true
        retryTask?.cancel()
        retryTask = nil
        var passes = 0
        repeat {
            syncAgain = false
            let ok = await runPass()
            passes += 1
            if !ok { break }
        } while syncAgain && passes < 5
        isSyncing = false
        if !lastPassFailed, document.editGeneration != syncedGeneration, debounceTask == nil {
            scheduleSync() // edited while the pass ran
        }
        status = settledStatus()
    }

    private func settledStatus() -> EditorSyncStatus {
        if case .offline = status, lastPassFailed { return status }
        if case .error = status, lastPassFailed || pendingMassDelete != nil { return status }
        return (debounceTask != nil || document.editGeneration != syncedGeneration) ? .saving : .saved
    }

    // MARK: - Executor

    /// One plan + execute pass. Returns false if it failed (status already set).
    private func runPass() async -> Bool {
        var generation = document.editGeneration
        var snapshot = document.paragraphs()
        var ops = EditorSyncPlanner.plan(previous: previous, current: snapshot)

        let restores = ops.filter(\.isRestore)
        if !restores.isEmpty {
            for case .restoreToken(let token, let depth, let after) in restores {
                if case .token(let type, let title) = token.kind {
                    Self.log.info("restore token \(token.blockID, privacy: .public) (\(type, privacy: .public)) — tokens are never deleted from the editor")
                    document.restoreToken(TokenInfo(blockID: token.blockID, type: type, title: title), depth: depth, afterBlockID: after)
                }
            }
            showRestoredHint(restores.count)
            debounceTask?.cancel() // the restore itself is not a user edit worth a second pass
            debounceTask = nil
            generation = document.editGeneration
            snapshot = document.paragraphs()
            ops = EditorSyncPlanner.plan(previous: previous, current: snapshot)
        }
        // Rich text to send, built from the paragraphs' attributes at plan time.
        var spansByBlock: [String: [RichTextSpan]] = [:]
        for paragraph in snapshot { if let id = paragraph.blockID { spansByBlock[id] = paragraph.spans } }
        ops.removeAll(where: \.isRestore)

        // Safety net: a sync that would trash most of the page needs an explicit confirmation.
        let deletes = ops.filter(\.isDelete).count
        let textBlocks = previous.filter { !$0.kind.isToken }.count
        if deletes >= 3, deletes * 2 > textBlocks, !massDeleteConfirmed {
            pendingMassDelete = deletes
            status = .error("Not saved: this would delete \(deletes) blocks.")
            lastPassFailed = true
            Self.log.notice("held back: \(deletes) deletes of \(textBlocks) blocks need confirmation")
            return false
        }
        massDeleteConfirmed = false
        pendingMassDelete = nil

        guard !ops.isEmpty else {
            syncedGeneration = generation
            lastPassFailed = false
            return true
        }

        status = .saving
        Self.log.info("sync pass: \(ops.count) ops")
        var localToBlock: [String: String] = [:]
        var failedLocal = Set<String>()
        var errors: [String] = []
        var transient: String?

        func resolve(_ localID: String) -> String? {
            if failedLocal.contains(localID) { return nil }
            return localToBlock[localID] ?? document.blockID(forLocalID: localID)
        }

        opLoop: for op in ops {
            switch op {
            case .update(let blockID, let kind, let content):
                let spans = spansByBlock[blockID] ?? SpanRuns.spans(fromContent: content, kind: kind)
                let previousKind = previous.first(where: { $0.blockID == blockID })?.kind
                let outcome = await writeQueue.submit(
                    .updateBlock(blockId: blockID, type: kind.apiType, update: Self.blockUpdate(kind: kind, spans: spans, previousKind: previousKind)),
                    using: client, retainOnTransientFailure: false
                )
                switch outcome {
                case .saved:
                    confirmUpdate(blockID, kind: kind, spans: spans)
                    Self.log.info("update \(blockID, privacy: .public) \(kind.apiType, privacy: .public): ok")
                case .queued(let message):
                    Self.log.error("update \(blockID, privacy: .public): transient failure: \(message, privacy: .public)")
                    transient = message
                    break opLoop
                case .failed(let message):
                    Self.log.error("update \(blockID, privacy: .public) failed: \(message, privacy: .public)")
                    if Self.isGone(message) {
                        // Deleted in Notion meanwhile: forget the id so the paragraph is re-inserted.
                        confirmDelete(blockID)
                        document.clearBlockID(blockID)
                        syncAgain = true
                    } else {
                        errors.append(message)
                    }
                }

            case .insert(let parent, let position, let paragraphs):
                let localIDs = paragraphs.map(\.localID)
                let parentID: String?
                switch parent {
                case .page: parentID = pageId
                case .block(let id): parentID = id
                case .pending(let localID): parentID = resolve(localID)
                }
                let resolvedPosition: BlockPosition?
                switch position {
                case .start: resolvedPosition = .start
                case .after(let id): resolvedPosition = .after(id)
                case .afterPending(let localID): resolvedPosition = resolve(localID).map { .after($0) }
                }
                guard let parentID, let resolvedPosition else {
                    Self.log.error("insert of \(paragraphs.count) skipped: unresolved parent/anchor (an earlier insert failed)")
                    failedLocal.formUnion(localIDs)
                    continue
                }
                do {
                    let created = try await client.appendBlocks(parentId: parentID, try await prepareBlocks(paragraphs), position: resolvedPosition)
                    guard created.count >= paragraphs.count else {
                        throw NotionError.decoding("appendBlocks returned \(created.count) blocks for \(paragraphs.count)")
                    }
                    var synced: [SyncedParagraph] = []
                    for (paragraph, block) in zip(paragraphs, created) {
                        localToBlock[paragraph.localID] = block.id
                        let stamped = document.setBlockID(block.id, forLocalID: paragraph.localID)
                        if !stamped {
                            Self.log.notice("inserted \(block.id, privacy: .public) but its paragraph is gone — will delete next pass")
                        }
                        // An image's confirmed kind is Notion's own (hosted file URL), not the upload id.
                        let served = Self.kind(of: block)
                        let kind = paragraph.kind.isImage && served.isImage ? served : paragraph.kind
                        synced.append(SyncedParagraph(blockID: block.id, parentID: parent == .page ? nil : parentID, kind: kind, spans: paragraph.spans))
                    }
                    confirmInsert(synced, parentID: parent == .page ? nil : parentID, position: resolvedPosition)
                    Self.log.info("insert \(paragraphs.count) under \(parentID, privacy: .public) at \(String(describing: resolvedPosition), privacy: .public): ok \(created.map(\.id).joined(separator: ","), privacy: .public)")
                } catch let error as NotionError where error.isTransient {
                    Self.log.error("insert transient failure: \(error.localizedDescription, privacy: .public)")
                    transient = error.localizedDescription
                    break opLoop
                } catch {
                    Self.log.error("insert failed: \(String(describing: error), privacy: .public)")
                    failedLocal.formUnion(localIDs)
                    errors.append(Self.humanMessage(for: error))
                }

            case .delete(let blockID):
                let outcome = await writeQueue.submit(.deleteBlock(blockId: blockID), using: client, retainOnTransientFailure: false)
                switch outcome {
                case .saved:
                    confirmDelete(blockID)
                    Self.log.info("delete \(blockID, privacy: .public): ok")
                case .queued(let message):
                    Self.log.error("delete \(blockID, privacy: .public): transient failure: \(message, privacy: .public)")
                    transient = message
                    break opLoop
                case .failed(let message):
                    if Self.isGone(message) {
                        confirmDelete(blockID)
                        Self.log.info("delete \(blockID, privacy: .public): already gone")
                    } else {
                        Self.log.error("delete \(blockID, privacy: .public) failed: \(message, privacy: .public)")
                        errors.append(message)
                    }
                }

            case .restoreToken:
                break
            }
        }

        saveCache()
        if let transient {
            lastPassFailed = true
            status = .offline(transient)
            scheduleRetry()
            return false
        }
        if !errors.isEmpty {
            lastPassFailed = true
            status = .error("Not saved: \(errors[0])")
            return false
        }
        lastPassFailed = false
        if document.editGeneration == generation {
            syncedGeneration = generation
            // Self-check: a fully confirmed pass must leave nothing to do.
            let leftover = EditorSyncPlanner.plan(previous: previous, current: document.paragraphs()).filter { !$0.isRestore }
            if !leftover.isEmpty {
                Self.log.fault("post-sync plan not empty (\(leftover.count) ops): \(String(describing: leftover), privacy: .public)")
                syncAgain = true
            }
        }
        return true
    }

    private func scheduleRetry() {
        retryTask?.cancel()
        let delay = retryNanos
        retryTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: delay)
            guard !Task.isCancelled, let self else { return }
            self.retryTask = nil
            Self.log.info("retrying sync after transient failure")
            await self.syncNow()
        }
    }

    // MARK: - Confirmed-state bookkeeping

    private func confirmUpdate(_ blockID: String, kind: ParagraphKind, spans: [RichTextSpan]) {
        guard let index = previous.firstIndex(where: { $0.blockID == blockID }) else { return }
        previous[index].set(kind: kind, spans: spans)
    }

    private func confirmDelete(_ blockID: String) {
        var removed: Set<String> = [blockID]
        previous.removeAll { block in
            if removed.contains(block.blockID) { return true }
            if let parent = block.parentID, removed.contains(parent) {
                removed.insert(block.blockID) // pre-order: descendants follow their parent
                return true
            }
            return false
        }
    }

    private func confirmInsert(_ blocks: [SyncedParagraph], parentID: String?, position: BlockPosition) {
        var index = previous.count
        switch position {
        case .start:
            if let parentID {
                if let p = previous.firstIndex(where: { $0.blockID == parentID }) { index = p + 1 }
            } else {
                index = 0
            }
        case .after(let anchor):
            if let a = previous.firstIndex(where: { $0.blockID == anchor }) {
                index = a + 1
                var subtree: Set<String> = [anchor]
                while index < previous.count, let parent = previous[index].parentID, subtree.contains(parent) {
                    subtree.insert(previous[index].blockID)
                    index += 1
                }
            }
        case .end:
            break
        }
        previous.insert(contentsOf: blocks, at: index)
    }

    private func saveCache() {
        cache?.save(previous, forPin: cacheKey, kind: Self.cacheKind)
    }

    private func updateEmpty() {
        let empty = document.isEmpty
        if empty != isDocumentEmpty { isDocumentEmpty = empty }
    }

    private func showRestoredHint(_ count: Int) {
        restoredTokenHint = count == 1
            ? "Restored a block that can't be deleted here. Delete it in Notion."
            : "Restored \(count) blocks that can't be deleted here. Delete them in Notion."
        hintTask?.cancel()
        hintTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            guard !Task.isCancelled else { return }
            self?.restoredTokenHint = nil
        }
    }

    // MARK: - Conversions

    nonisolated static func kind(of block: Block) -> ParagraphKind {
        switch block.type {
        case .paragraph: return .paragraph
        case .heading1: return .heading1
        case .heading2: return .heading2
        case .heading3: return .heading3
        case .toDo(let checked): return .toDo(checked: checked)
        case .bulletedListItem: return .bulleted
        case .numberedListItem: return .numbered
        case .quote: return .quote
        case .code(let language): return .code(language: ParagraphSyntax.normalizeLanguage(language))
        case .divider: return .divider
        case .toggle: return .toggle
        case .callout:
            switch block.icon {
            case .emoji(let emoji): return .callout(icon: emoji)
            case nil, .some(Icon.none): return .callout(icon: ParagraphKind.defaultCalloutIcon)
            default: return .callout(icon: "") // external/file icon: kept untouched in Notion
            }
        case .childDatabase(let title): return .token(type: "child_database", title: title.isEmpty ? "Untitled database" : title)
        case .childPage(let title): return .token(type: "child_page", title: title.isEmpty ? "Untitled page" : title)
        case .unsupported("image") where block.imageSource != nil: return .image(source: block.imageSource!)
        case .unsupported(let type): return .token(type: type, title: block.plainText.isEmpty ? type.replacingOccurrences(of: "_", with: " ") : block.plainText)
        }
    }

    /// A server block's rich text as editor spans.
    nonisolated static func spans(of block: Block, kind: ParagraphKind) -> [RichTextSpan] {
        switch kind {
        case .code: return block.plainText.isEmpty ? [] : [RichTextSpan(text: block.plainText)]
        case .divider, .token, .image: return []
        default: return SpanRuns.normalize(block.richText)
        }
    }

    nonisolated static func blockUpdate(kind: ParagraphKind, spans: [RichTextSpan], previousKind: ParagraphKind? = nil) -> BlockUpdate {
        switch kind {
        case .callout(let icon):
            // Only send the icon when it changed, so a non-emoji icon is never overwritten.
            let changed = previousKind.map { $0 != kind } ?? true
            return .calloutContent(richText: spans, emoji: changed && !icon.isEmpty ? icon : nil)
        case .toDo(let checked): return .content(richText: spans, checked: checked, language: nil)
        case .code(let language): return .content(richText: spans, checked: nil, language: ParagraphSyntax.sendableLanguage(language))
        default: return .content(richText: spans, checked: nil, language: nil)
        }
    }

    nonisolated static func newBlock(for paragraph: DocParagraph) -> NewBlock {
        let spans = paragraph.spans
        switch paragraph.kind {
        case .paragraph, .token: return .formatted(.paragraph, richText: spans)
        case .toggle: return .formatted(.toggle, richText: spans)
        case .callout(let icon): return .callout(richText: spans, emoji: icon.isEmpty ? ParagraphKind.defaultCalloutIcon : icon)
        case .heading1: return .formatted(.heading1, richText: spans)
        case .heading2: return .formatted(.heading2, richText: spans)
        case .heading3: return .formatted(.heading3, richText: spans)
        case .bulleted: return .formatted(.bulletedListItem, richText: spans)
        case .numbered: return .formatted(.numberedListItem, richText: spans)
        case .toDo(let checked): return .formatted(.toDo, richText: spans, checked: checked)
        case .quote: return .formatted(.quote, richText: spans)
        case .code(let language): return .formatted(.code, richText: spans, language: ParagraphSyntax.sendableLanguage(language))
        case .divider: return .formatted(.divider, richText: [])
        case .image(let source):
            switch ImageSource(encoded: source) {
            case .upload(let id): return .imageUpload(id: id)
            case .external(let url), .file(let url): return .imageExternal(url) // file: re-uploaded first (prepareBlocks)
            case nil: return .formatted(.paragraph, richText: [])
            }
        }
    }

    nonisolated static func isGone(_ message: String) -> Bool {
        message == NotionError.notFound.localizedDescription || message.lowercased().contains("archived")
    }

    public static func humanMessage(for error: Error) -> String {
        if let notionError = error as? NotionError {
            switch notionError {
            case .notFound, .notShared: return "Page not found or not shared with your integration"
            default: return notionError.localizedDescription
            }
        }
        return (error as NSError).localizedDescription
    }
}

extension EditorSyncOp {
    var isRestore: Bool { if case .restoreToken = self { return true }; return false }
    var isDelete: Bool { if case .delete = self { return true }; return false }
}
