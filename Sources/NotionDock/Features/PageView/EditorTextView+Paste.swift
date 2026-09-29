import AppKit
import SwiftUI
import NotionKit

// Paste converts Markdown to blocks + formatting; copy/cut put Markdown on the pasteboard as
// plain text; ⌘K edits a link in a small popover.
extension EditorTextView {
    override func paste(_ sender: Any?) {
        if insertImages(from: .general, at: selectedRange().location) { return }
        guard let text = NSPasteboard.general.string(forType: .string) else { super.paste(sender); return }
        commands?.paste(text)
    }

    override func pasteAsPlainText(_ sender: Any?) {
        paste(sender)
    }

    override var writablePasteboardTypes: [NSPasteboard.PasteboardType] { [.string] }

    override func writeSelection(to pboard: NSPasteboard, types: [NSPasteboard.PasteboardType]) -> Bool {
        guard let commands else { return super.writeSelection(to: pboard, types: types) }
        let markdown = commands.markdown(for: selectedRange())
        pboard.declareTypes([.string], owner: nil)
        return pboard.setString(markdown, forType: .string)
    }

    // MARK: - ⌘K link popover

    func showLinkPopover() {
        let range = selectedRange()
        guard range.length > 0, let window, let storage = textStorage else { NSSound.beep(); return }
        let existing = (storage.attribute(.notionLink, at: range.location, effectiveRange: nil) as? URL)?.absoluteString ?? ""
        let popover = NSPopover()
        popover.behavior = .transient
        popover.appearance = NSAppearance(named: .darkAqua)
        popover.contentViewController = NSHostingController(rootView: LinkField(initial: existing) { [weak self, weak popover] value in
            popover?.close()
            guard let self else { return }
            let trimmed = value.trimmingCharacters(in: .whitespaces)
            let url: URL? = trimmed.isEmpty ? nil : URL(string: trimmed.contains("://") ? trimmed : "https://" + trimmed)
            self.commands?.setLink(url, range: range)
            window.makeFirstResponder(self)
        })
        let screenRect = firstRect(forCharacterRange: range, actualRange: nil)
        let windowRect = window.convertFromScreen(screenRect)
        let rect = convert(windowRect, from: nil)
        popover.show(relativeTo: rect, of: self, preferredEdge: .maxY)
    }
}

/// A one-line URL field ("⏎" applies, empty removes the link).
struct LinkField: View {
    @State var text: String
    let onSubmit: (String) -> Void
    @FocusState private var focused: Bool

    init(initial: String, onSubmit: @escaping (String) -> Void) {
        _text = State(initialValue: initial)
        self.onSubmit = onSubmit
    }

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "link")
                .font(.system(size: 11))
                .foregroundStyle(Theme.Color.secondaryText)
            TextField("Paste link", text: $text)
                .textFieldStyle(.plain)
                .font(Theme.Font.small)
                .focused($focused)
                .onSubmit { onSubmit(text) }
        }
        .padding(8)
        .frame(width: 240)
        .onAppear { focused = true }
    }
}
