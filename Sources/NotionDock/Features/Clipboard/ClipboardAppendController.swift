import AppKit
import NotionKit

/// Handles `.clipboardAppendRequested`: appends the clipboard to the last-opened page pin.
@MainActor
final class ClipboardAppendController {
    static let lastOpenedPinKey = "NotionDock.lastOpenedPinID"

    private let appModel: AppModel
    private var observer: NSObjectProtocol?

    init(appModel: AppModel) {
        self.appModel = appModel
        observer = NotificationCenter.default.addObserver(forName: .clipboardAppendRequested, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.handle() }
        }
    }

    static func content(of pasteboard: NSPasteboard) -> ClipboardContent {
        if let text = pasteboard.string(forType: .string), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .text(text)
        }
        let imageTypes: [NSPasteboard.PasteboardType] = [.png, .tiff, NSPasteboard.PasteboardType("public.jpeg")]
        if pasteboard.availableType(from: imageTypes) != nil { return .image }
        return .empty
    }

    private func handle() {
        guard let id = UserDefaults.standard.string(forKey: Self.lastOpenedPinKey),
              let pin = appModel.pinStore.pins.first(where: { $0.id == id }), pin.kind == .page else {
            CaptureToast.show("Open a page pin first", isError: true)
            return
        }
        switch ClipboardMapper.map(Self.content(of: .general)) {
        case .unsupported(let message):
            CaptureToast.show(message, isError: true)
        case .blocks(let blocks):
            Task {
                let op = PendingWrite.Operation.appendBlocks(parentId: pin.notionId, blocks: blocks, position: .end)
                switch await appModel.writeQueue.submit(op, using: appModel.client) {
                case .saved:
                    NotificationCenter.default.post(name: .pinContentDidChange, object: pin.id)
                    CaptureToast.show("Pasted into \(pin.title) ✓")
                case .queued:
                    CaptureToast.show("Saved offline, will sync")
                case .failed(let message):
                    CaptureToast.show(message, isError: true)
                }
            }
        }
    }
}
