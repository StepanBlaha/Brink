import AppKit
import SwiftUI
import NotionKit

/// ⌘F find for the page editor: a compact bar (dark, matches the notch) instead of the system
/// find bar. Matches are highlighted with layout-manager temporary attributes, so the text
/// storage — and therefore sync — is never touched.
@MainActor
@Observable
final class EditorFindController {
    var isVisible = false
    var query = "" { didSet { if query != oldValue { search(keepPosition: false) } } }
    private(set) var matches: [NSRange] = []
    private(set) var current: Int?
    /// Bumped to ask the bar to focus its field.
    private(set) var focusRequest = 0

    @ObservationIgnored weak var textView: NSTextView?

    var countLabel: String {
        guard !query.isEmpty else { return "" }
        guard let current, !matches.isEmpty else { return "0 of 0" }
        return "\(current + 1) of \(matches.count)"
    }

    /// Routes `performFindPanelAction:` (menu ⌘F / ⌘G / ⇧⌘G) from the text view.
    func perform(_ action: NSFindPanelAction) {
        switch action {
        case .showFindPanel:
            if !isVisible, let textView, textView.selectedRange().length > 0, textView.selectedRange().length < 200 {
                query = (textView.string as NSString).substring(with: textView.selectedRange())
            }
            show()
        case .next: if isVisible { next() } else { show() }
        case .previous: if isVisible { previous() } else { show() }
        default: show()
        }
    }

    func show() {
        isVisible = true
        focusRequest += 1
        search(keepPosition: true)
    }

    func close() {
        isVisible = false
        clearHighlights()
        matches = []
        current = nil
        if let textView { textView.window?.makeFirstResponder(textView) }
    }

    func next() { step(1) }
    func previous() { step(-1) }

    /// The document changed: re-run the search, staying near the current match.
    func textDidChange() {
        guard isVisible else { return }
        search(keepPosition: true)
    }

    private func step(_ delta: Int) {
        guard !matches.isEmpty else { return }
        current = ((current ?? (delta > 0 ? -1 : 0)) + delta + matches.count) % matches.count
        highlight(reveal: true)
    }

    private func search(keepPosition: Bool) {
        guard let textView else { return }
        let previousLocation = current.flatMap { matches.indices.contains($0) ? matches[$0].location : nil }
            ?? textView.selectedRange().location
        matches = []
        if !query.isEmpty {
            let ns = textView.string as NSString
            var range = NSRange(location: 0, length: ns.length)
            while range.length > 0 {
                let found = ns.range(of: query, options: [.caseInsensitive, .diacriticInsensitive], range: range)
                guard found.location != NSNotFound, found.length > 0 else { break }
                matches.append(found)
                let next = NSMaxRange(found)
                range = NSRange(location: next, length: ns.length - next)
            }
        }
        if matches.isEmpty {
            current = nil
        } else {
            current = matches.firstIndex(where: { $0.location >= previousLocation }) ?? 0
        }
        highlight(reveal: !keepPosition)
    }

    private func clearHighlights() {
        guard let textView, let layoutManager = textView.layoutManager else { return }
        layoutManager.removeTemporaryAttribute(.backgroundColor, forCharacterRange: NSRange(location: 0, length: (textView.string as NSString).length))
    }

    private func highlight(reveal: Bool) {
        guard let textView, let layoutManager = textView.layoutManager else { return }
        clearHighlights()
        let accent = NSColor(Theme.Color.accent)
        for (index, match) in matches.enumerated() {
            let color = index == current ? accent.withAlphaComponent(0.85) : accent.withAlphaComponent(0.3)
            layoutManager.addTemporaryAttribute(.backgroundColor, value: color, forCharacterRange: match)
        }
        if reveal, let current, matches.indices.contains(current) {
            textView.scrollRangeToVisible(matches[current])
        }
    }
}

struct FindBar: View {
    @Bindable var controller: EditorFindController
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 11))
                .foregroundStyle(Theme.Color.secondaryText)
            TextField("Find in page", text: $controller.query)
                .textFieldStyle(.plain)
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.text)
                .focused($focused)
                .onKeyPress(.return, phases: .down) { press in
                    if press.modifiers.contains(.shift) { controller.previous() } else { controller.next() }
                    return .handled
                }
                .onExitCommand { controller.close() }
            Text(controller.countLabel)
                .font(Theme.Font.caption)
                .monospacedDigit()
                .foregroundStyle(Theme.Color.secondaryText)
            button("chevron.up") { controller.previous() }
            button("chevron.down") { controller.next() }
            button("xmark") { controller.close() }
        }
        .padding(.horizontal, Theme.Metrics.hPadding)
        .padding(.vertical, 6)
        .background(Theme.Color.sidebar)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.Color.divider).frame(height: 1) }
        .onAppear { focused = true }
        .onChange(of: controller.focusRequest) { focused = true }
    }

    private func button(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 10, weight: .semibold))
                .frame(width: 18, height: 18)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(Theme.Color.secondaryText)
        .focusEffectDisabled()
    }
}
