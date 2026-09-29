import AppKit
import SwiftUI
import UniformTypeIdentifiers

/// Principal class of the Share extension: reads the shared URL/text, shows the Brink sheet,
/// and on Save appends a `capture` action to the shared inbox for the main app to apply.
final class ShareViewController: NSViewController {
    private let model = ShareModel()

    override var nibName: NSNib.Name? { nil }

    override func loadView() {
        let root = ShareSheetView(model: model, onCancel: { [weak self] in self?.cancel() }, onSave: { [weak self] in self?.save() })
        let hosting = NSHostingView(rootView: root)
        hosting.frame = NSRect(x: 0, y: 0, width: 380, height: 250)
        view = hosting
        preferredContentSize = hosting.frame.size
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        Task { @MainActor in await model.load(from: items) }
    }

    private func save() {
        do {
            guard let inbox = SharedInbox.shared else { throw CocoaError(.fileNoSuchFile) }
            try inbox.append(model.action)
            SharedContainer.postInboxNotification()
            model.rememberDestination()
            extensionContext?.completeRequest(returningItems: nil)
        } catch {
            model.error = "Couldn't save. Open Brink and try again. (\(error.localizedDescription))"
        }
    }

    private func cancel() {
        extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
    }
}

@MainActor
final class ShareModel: ObservableObject {
    private static let lastPinKey = "BrinkShare.lastPinID"

    @Published var text = ""
    @Published var url = ""
    @Published var pinID: String = ""
    @Published var error: String?
    let pins: [WidgetSnapshot.PinEntry]

    init() {
        pins = WidgetSnapshot.load().pins
        let saved = UserDefaults.standard.string(forKey: Self.lastPinKey) ?? ""
        pinID = pins.contains { $0.id == saved } ? saved : ""
    }

    var canSave: Bool { !(text + url).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var action: InboxAction {
        let trimmedURL = url.trimmingCharacters(in: .whitespacesAndNewlines)
        return .capture(text: text.trimmingCharacters(in: .whitespacesAndNewlines),
                        url: trimmedURL.isEmpty ? nil : trimmedURL,
                        pinId: pinID.isEmpty ? nil : pinID)
    }

    func rememberDestination() { UserDefaults.standard.set(pinID, forKey: Self.lastPinKey) }

    func load(from items: [NSExtensionItem]) async {
        for item in items {
            if text.isEmpty, let title = item.attributedTitle?.string, !title.isEmpty { text = title }
            if text.isEmpty, let body = item.attributedContentText?.string, !body.isEmpty { text = body }
            for provider in item.attachments ?? [] {
                if url.isEmpty, provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                   let found = await Self.loadURL(provider) {
                    url = found.absoluteString
                } else if text.isEmpty, provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                          let found = await Self.loadText(provider) {
                    text = found
                }
            }
        }
        // A bare URL shared as text: move it to the URL field.
        if url.isEmpty, let link = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
           link.scheme?.hasPrefix("http") == true {
            url = link.absoluteString
            text = ""
        }
    }

    private static func loadURL(_ provider: NSItemProvider) async -> URL? {
        await withCheckedContinuation { cont in
            _ = provider.loadObject(ofClass: URL.self) { value, _ in cont.resume(returning: value) }
        }
    }

    private static func loadText(_ provider: NSItemProvider) async -> String? {
        await withCheckedContinuation { cont in
            _ = provider.loadObject(ofClass: String.self) { value, _ in cont.resume(returning: value) }
        }
    }
}
