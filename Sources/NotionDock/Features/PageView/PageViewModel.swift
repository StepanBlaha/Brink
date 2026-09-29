import AppKit
import Foundation
import Observation
import NotionKit

/// The editor's save state, shown in `PageView`'s footer.
typealias SyncStatus = EditorSyncStatus

/// Page editor state for one pinned page. A thin, app-side wrapper around
/// `NotionKit.PageEditorEngine` (exact block-identity sync, tested end to end in NotionKitTests)
/// that wires in the AppKit styling/chips and flushes unsaved edits when the app quits.
@MainActor
@Observable
final class PageViewModel {
    let pageId: String
    let pinId: String
    let engine: PageEditorEngine

    @ObservationIgnored private var terminateObserver: NSObjectProtocol?

    init(pageId: String, pinId: String, client: NotionClient, cache: Cache, writeQueue: WriteQueue) {
        self.pageId = pageId
        self.pinId = pinId
        let document = EditorDocument()
        document.baseAttributes = EditorStyling.baseAttributes()
        document.styler = { storage, range in EditorStyling.style(storage, range: range) }
        document.attachmentFactory = { info in
            info.type == EditorDocument.uploadPlaceholderType ? UploadingAttachmentCell.attachment() : TokenAttachment(info: info)
        }
        let engine = PageEditorEngine(pageId: pageId, client: client, writeQueue: writeQueue, cache: cache, cacheKey: pinId, document: document)
        self.engine = engine
        document.imageAttachmentFactory = { [weak engine, weak document] info in
            let blockID = info.blockID
            return ImageAttachmentCell.attachment(for: info, refresh: { [weak engine] in
                guard let blockID, let engine else { return nil }
                return await engine.freshImageURL(blockID: blockID)
            }, view: { document?.textView })
        }
        let store = EditorImageStore.shared
        engine.imageDataProvider = { url in await store.data(for: url) }
        engine.onImageUploaded = { id, data in store.remember(uploadID: id, data: data) }
        terminateObserver = NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.flushBeforeQuit() }
        }
    }

    var document: EditorDocument { engine.document }
    var syncStatus: SyncStatus { engine.status }
    var isLoading: Bool { engine.isLoading }
    var hasLoaded: Bool { engine.hasLoaded }
    var errorMessage: String? { engine.errorMessage }
    var pendingMassDelete: Int? { engine.pendingMassDelete }
    var restoredTokenHint: String? { engine.restoredTokenHint }
    var isDocumentEmpty: Bool { engine.isDocumentEmpty }
    var cover: FileRef? { engine.cover }

    /// ⌘F find state for this page's editor.
    let find = EditorFindController()

    /// A fresh cover URL (Notion file URLs expire), for `CoverCache` on 403.
    var refreshCover: @Sendable () async -> URL? {
        let engine = engine
        return { await engine.refreshPageMeta()?.url }
    }

    func load() async {
        await engine.load()
    }

    func startPolling() {
        engine.startPolling()
    }

    /// Stops polling and flushes any pending edit (panel closed / view disappeared).
    func stopPolling() {
        engine.stopPolling()
    }

    /// Pasted/dropped image → upload → image block after the paragraph at `location`.
    func insertImage(_ image: PastedImage, afterParagraphAt location: Int) {
        Task { await engine.insertImage(data: image.data, filename: image.filename, contentType: image.contentType, afterParagraphAt: location) }
    }

    func confirmMassDelete() {
        engine.confirmMassDelete()
    }

    /// App quit: push pending edits out, spinning the run loop (main-actor tasks run on it) for
    /// at most 3 s.
    private func flushBeforeQuit() {
        guard engine.hasLoaded, engine.hasUnsyncedChanges else { return }
        let finished = Box()
        Task {
            await engine.syncNow()
            finished.value = true
        }
        let deadline = Date().addingTimeInterval(3)
        while !finished.value || engine.isSyncing, Date() < deadline {
            RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.05))
        }
    }

    private final class Box { var value = false }

    static func humanMessage(for error: Error) -> String {
        PageEditorEngine.humanMessage(for: error)
    }
}
