import AppKit
import SwiftUI
import NotionKit

/// State of the "/" block-type menu.
@MainActor
@Observable
final class SlashMenuModel {
    var items: [SlashCommand] = SlashCommand.allCases
    var selected = 0
    var hovered: Int?
    @ObservationIgnored var onPick: (SlashCommand) -> Void = { _ in }
}

/// Notion-style "/" menu for one `EditorTextView`: opened by typing "/" at the start of an empty
/// (or whitespace-only) paragraph or after a space, filtered by what follows, driven by the
/// text view's keys (↑↓ ⏎ Esc) and shown in a non-activating child panel under the caret so the
/// text view keeps focus.
@MainActor
final class SlashMenuController {
    private weak var textView: EditorTextView?
    private let model = SlashMenuModel()
    private var panel: SlashMenuPanel?
    /// Location of the "/" while the menu is open.
    private(set) var anchor: Int?
    private var pendingSlash = false

    static let rowHeight: CGFloat = 28
    static let width: CGFloat = 220

    init(textView: EditorTextView) {
        self.textView = textView
        model.onPick = { [weak self] command in self?.apply(command) }
    }

    var isOpen: Bool { anchor != nil }

    // MARK: - Text view hooks

    func willChangeText(replacement: String?) {
        pendingSlash = replacement == "/"
    }

    func textDidChange() {
        guard let textView, let storage = textView.textStorage else { return }
        if pendingSlash, anchor == nil {
            pendingSlash = false
            let caret = textView.selectedRange().location
            let slash = caret - 1
            guard slash >= 0, slash < storage.length, (storage.string as NSString).character(at: slash) == 0x2F else { return }
            guard let document = textView.document else { return }
            let kind = document.kind(at: slash)
            guard kind.hasText else { return }
            if case .code = kind { return }
            let content = document.paragraphRange(at: slash).content
            let before = (storage.string as NSString).substring(with: NSRange(location: content.location, length: slash - content.location))
            let atLineStart = before.allSatisfy { $0 == " " || $0 == "\t" }
            let afterSpace = before.hasSuffix(" ")
            guard atLineStart || afterSpace else { return }
            open(at: slash)
            return
        }
        pendingSlash = false
        refresh()
    }

    func selectionDidChange() {
        guard anchor != nil else { return }
        refresh()
    }

    /// Keys while open: returns true if consumed.
    func handle(_ selector: Selector) -> Bool {
        guard isOpen else { return false }
        switch selector {
        case #selector(NSResponder.moveUp(_:)):
            if !model.items.isEmpty { model.selected = (model.selected - 1 + model.items.count) % model.items.count }
            return true
        case #selector(NSResponder.moveDown(_:)):
            if !model.items.isEmpty { model.selected = (model.selected + 1) % model.items.count }
            return true
        case #selector(NSResponder.insertNewline(_:)), #selector(NSResponder.insertTab(_:)):
            if model.items.indices.contains(model.selected) { apply(model.items[model.selected]) } else { close() }
            return true
        case #selector(NSResponder.cancelOperation(_:)):
            close()
            return true
        default:
            return false
        }
    }

    // MARK: - Open / filter / close

    private func open(at slash: Int) {
        anchor = slash
        model.items = SlashCommand.allCases
        model.selected = 0
        model.hovered = nil
        showPanel()
    }

    private func refresh() {
        guard let anchor, let textView, let storage = textView.textStorage else { return }
        let ns = storage.string as NSString
        let caret = textView.selectedRange().location
        guard let document = textView.document else { close(); return }
        let content = document.paragraphRange(at: anchor).content
        guard anchor < ns.length, ns.character(at: anchor) == 0x2F, caret > anchor, caret <= NSMaxRange(content),
              textView.selectedRange().length == 0 else { close(); return }
        let query = ns.substring(with: NSRange(location: anchor + 1, length: caret - anchor - 1))
        let matches = SlashCommand.matching(query)
        if matches.isEmpty && query.hasSuffix(" ") { close(); return }
        if matches.isEmpty && query.count > 12 { close(); return }
        model.items = matches
        model.selected = min(model.selected, max(0, matches.count - 1))
        if !query.isEmpty, model.selected >= matches.count { model.selected = 0 }
        showPanel()
    }

    func close() {
        anchor = nil
        if let panel {
            panel.parent?.removeChildWindow(panel)
            panel.orderOut(nil)
        }
    }

    private func apply(_ command: SlashCommand) {
        guard let anchor, let textView else { return }
        close()
        textView.commands?.applySlash(command, slashLocation: anchor)
    }

    // MARK: - Panel

    private func showPanel() {
        guard let anchor, let textView, let window = textView.window else { return }
        let panel = self.panel ?? makePanel()
        let rows = max(1, model.items.count)
        let height = CGFloat(rows) * Self.rowHeight + 8
        var caretRect = textView.firstRect(forCharacterRange: NSRange(location: anchor, length: 1), actualRange: nil)
        if caretRect.isEmpty && caretRect.origin == .zero { caretRect = window.frame }
        var origin = NSPoint(x: caretRect.minX - 4, y: caretRect.minY - height - 4)
        if let screen = window.screen ?? NSScreen.main {
            let visible = screen.visibleFrame
            if origin.y < visible.minY { origin.y = caretRect.maxY + 4 }
            origin.x = min(max(origin.x, visible.minX + 4), visible.maxX - Self.width - 4)
        }
        panel.setFrame(NSRect(origin: origin, size: NSSize(width: Self.width, height: height)), display: true)
        if panel.parent == nil {
            panel.level = window.level
            window.addChildWindow(panel, ordered: .above)
        }
        panel.orderFront(nil)
    }

    private func makePanel() -> SlashMenuPanel {
        let panel = SlashMenuPanel(
            contentRect: NSRect(x: 0, y: 0, width: Self.width, height: 100),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered, defer: false
        )
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.appearance = NSAppearance(named: .darkAqua)
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.contentView = FirstMouseHostingView(rootView: SlashMenuView(model: model))
        self.panel = panel
        return panel
    }
}

/// Never takes key status, so typing stays in the editor.
final class SlashMenuPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

/// Rows respond to the first click even though the panel is never key.
final class FirstMouseHostingView<Content: View>: NSHostingView<Content> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

struct SlashMenuView: View {
    @Bindable var model: SlashMenuModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if model.items.isEmpty {
                Text("No results")
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.tertiaryText)
                    .frame(maxWidth: .infinity, minHeight: SlashMenuController.rowHeight, alignment: .leading)
                    .padding(.horizontal, 8)
            }
            ForEach(Array(model.items.enumerated()), id: \.element) { index, command in
                row(command, index: index)
            }
        }
        .padding(4)
        .frame(width: SlashMenuController.width, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: Theme.Metrics.panelRadius, style: .continuous)
                .fill(Theme.Color.background)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Metrics.panelRadius, style: .continuous)
                .strokeBorder(Theme.Color.divider, lineWidth: 1)
        )
    }

    private func row(_ command: SlashCommand, index: Int) -> some View {
        let isSelected = index == model.selected
        return HStack(spacing: 8) {
            Image(systemName: command.symbol)
                .font(.system(size: 11, weight: .medium))
                .frame(width: 18)
            Text(command.title)
                .font(Theme.Font.small)
            Spacer(minLength: 0)
        }
        .foregroundStyle(isSelected ? Color.white : Theme.Color.text)
        .padding(.horizontal, 8)
        .frame(height: SlashMenuController.rowHeight)
        .background(
            RoundedRectangle(cornerRadius: Theme.Metrics.radius, style: .continuous)
                .fill(isSelected ? Theme.Color.accent : (model.hovered == index ? Theme.Color.hover : Color.clear))
        )
        .contentShape(Rectangle())
        .onHover { inside in
            if inside { model.hovered = index } else if model.hovered == index { model.hovered = nil }
        }
        .onTapGesture { model.onPick(command) }
    }
}
