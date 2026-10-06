import AppKit
import Foundation
import Observation
import NotionKit

/// Editor state for one Apple Note: HTML <-> `EditorDocument` blocks, debounced set-body saves,
/// 45 s polling (skipped while the user is typing), and read-only protection for notes whose
/// content the editor can't round-trip.
@MainActor
@Observable
final class NotesNoteModel {
    static let saveDebounce: TimeInterval = 1.2
    static let pollInterval: TimeInterval = 45
    /// A refresh never replaces text the user edited more recently than this.
    static let quietPeriod: TimeInterval = 5

    let noteId: String
    let document: EditorDocument
    let find = EditorFindController()

    private(set) var title = ""
    private(set) var hasLoaded = false
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var readOnlyMessage: String?
    private(set) var hasChecklist = false
    private(set) var status: EditorSyncStatus = .saved
    /// Notes changed under unsaved local edits; the user picks which version wins.
    private(set) var hasConflict = false

    @ObservationIgnored private let provider: NotesProviding
    @ObservationIgnored private var knownBlocks: [NoteBlock] = []
    @ObservationIgnored private var saveTask: Task<Void, Never>?
    @ObservationIgnored private var pollTask: Task<Void, Never>?
    @ObservationIgnored private var isSaving = false
    @ObservationIgnored private var dirty = false
    @ObservationIgnored private var terminateObserver: NSObjectProtocol?

    var isEditable: Bool { hasLoaded && readOnlyMessage == nil }

    init(noteId: String, provider: NotesProviding) {
        self.noteId = noteId
        self.provider = provider
        let document = EditorDocument()
        document.baseAttributes = EditorStyling.baseAttributes()
        document.styler = { storage, range in EditorStyling.style(storage, range: range) }
        document.attachmentFactory = { TokenAttachment(info: $0) }
        self.document = document
        document.onLocalEdit = { [weak self] in self?.localEdit() }
        terminateObserver = NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.flushBeforeQuit() }
        }
    }

    deinit {
        if let terminateObserver { NotificationCenter.default.removeObserver(terminateObserver) }
    }

    // MARK: - Loading

    func load(force: Bool = false) async {
        guard force || !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let note = try await provider.note(id: noteId)
            title = note.info.title
            errorMessage = nil
            apply(NotesHTML.parse(note.html), force: force || !hasLoaded)
            hasLoaded = true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Replaces the editor text with Notes' version, unless that would clobber the user.
    private func apply(_ parsed: ParsedNote, force: Bool) {
        readOnlyMessage = parsed.readOnlyMessage
        hasChecklist = parsed.hasChecklist
        let changed = parsed.blocks != knownBlocks
        guard force || changed else { return }
        if !force {
            let recentlyEdited = Date().timeIntervalSince(document.lastLocalEditAt ?? .distantPast) < Self.quietPeriod
            if recentlyEdited || dirty || isSaving { return }
        }
        knownBlocks = parsed.blocks
        document.load(Self.paragraphs(for: parsed.blocks), preserveSelection: !force)
        status = .saved
        hasConflict = false
    }

    static func paragraphs(for blocks: [NoteBlock]) -> [SyncedParagraph] {
        var lastAtDepth: [Int: String] = [:]
        return blocks.enumerated().map { index, block in
            let id = "note-\(index)"
            let depth = max(0, block.kind == .bulleted || block.kind == .numbered ? block.depth : 0)
            lastAtDepth[depth] = id
            for deeper in lastAtDepth.keys where deeper > depth { lastAtDepth[deeper] = nil }
            return SyncedParagraph(blockID: id, parentID: depth > 0 ? lastAtDepth[depth - 1] : nil, kind: block.kind, spans: block.spans)
        }
    }

    // MARK: - Polling

    func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(Self.pollInterval * 1_000_000_000))
                guard !Task.isCancelled else { return }
                await self?.load()
            }
        }
    }

    /// Panel closed: stop polling and push out any pending edit.
    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
        if dirty { Task { await save() } }
    }

    // MARK: - Saving

    private func localEdit() {
        guard isEditable else { return }
        dirty = true
        status = .saving
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.saveDebounce * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await self?.save()
        }
    }

    private func currentBlocks() -> [NoteBlock] {
        var blocks = document.paragraphs().map { NoteBlock(kind: $0.kind, depth: $0.depth, spans: SpanRuns.normalize($0.spans)) }
        while blocks.count > 1, let last = blocks.last, last.spans.isEmpty { blocks.removeLast() }
        return blocks
    }

    func save(overwrite: Bool = false) async {
        guard isEditable, dirty, !isSaving else { return }
        saveTask?.cancel()
        isSaving = true
        defer { isSaving = false }
        let generation = document.editGeneration
        let blocks = currentBlocks()
        do {
            // Notes may have changed since we loaded: never silently drop that version.
            if !overwrite {
                let remote = NotesHTML.parse(try await provider.note(id: noteId).html)
                if remote.blocks != knownBlocks {
                    hasConflict = true
                    status = .error("Changed in Notes while you were editing.")
                    return
                }
            }
            try await provider.setBody(noteId: noteId, html: NotesHTML.render(blocks))
            // Notes rewrites what it's given (headings become sized spans, lists are re-nested,
            // …), so remember its version: comparing against our own render would flag a
            // conflict on every following save.
            if let saved = try? await provider.note(id: noteId).html {
                knownBlocks = NotesHTML.parse(saved).blocks
            } else {
                knownBlocks = NotesHTML.parse(NotesHTML.render(blocks)).blocks
            }
            hasConflict = false
            if document.editGeneration == generation {
                dirty = false
                status = .saved
            } else {
                // Typed during the save: another pass follows.
                saveTask = Task { [weak self] in await self?.save() }
            }
        } catch {
            status = .error((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
        }
    }

    /// Conflict resolution: keep what's in the editor.
    func keepMine() { Task { await save(overwrite: true) } }

    /// Conflict resolution: drop local edits for Notes' version.
    func useNotesVersion() {
        dirty = false
        hasConflict = false
        Task { await load(force: true) }
    }

    func openInNotes() {
        Task { try? await provider.show(noteId: noteId) }
    }

    private func flushBeforeQuit() {
        guard dirty, isEditable else { return }
        let finished = Flag()
        Task { await save(); finished.value = true }
        let deadline = Date().addingTimeInterval(3)
        while !finished.value, Date() < deadline {
            RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.05))
        }
    }

    private final class Flag { var value = false }
}
