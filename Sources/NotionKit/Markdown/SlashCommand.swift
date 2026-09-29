import Foundation

/// The "/" menu's block-type commands, with filtering and the pure paragraph conversion.
public enum SlashCommand: String, CaseIterable, Sendable {
    case text, heading1, heading2, heading3, toDo, bulleted, numbered, quote, code, divider, toggle, callout

    public var title: String {
        switch self {
        case .text: return "Text"
        case .heading1: return "Heading 1"
        case .heading2: return "Heading 2"
        case .heading3: return "Heading 3"
        case .toDo: return "To-do"
        case .bulleted: return "Bulleted list"
        case .numbered: return "Numbered list"
        case .quote: return "Quote"
        case .code: return "Code"
        case .divider: return "Divider"
        case .toggle: return "Toggle"
        case .callout: return "Callout"
        }
    }

    /// SF Symbol for the menu row.
    public var symbol: String {
        switch self {
        case .text: return "textformat"
        case .heading1: return "textformat.size.larger"
        case .heading2: return "textformat.size"
        case .heading3: return "textformat.size.smaller"
        case .toDo: return "checkmark.square"
        case .bulleted: return "list.bullet"
        case .numbered: return "list.number"
        case .quote: return "text.quote"
        case .code: return "chevron.left.forwardslash.chevron.right"
        case .divider: return "minus"
        case .toggle: return "chevron.right"
        case .callout: return "lightbulb"
        }
    }

    var keywords: [String] {
        switch self {
        case .text: return ["paragraph", "plain"]
        case .heading1: return ["h1", "title"]
        case .heading2: return ["h2", "subtitle"]
        case .heading3: return ["h3"]
        case .toDo: return ["todo", "task", "checkbox"]
        case .bulleted: return ["bullet", "ul", "list"]
        case .numbered: return ["number", "ol", "list"]
        case .quote: return ["blockquote"]
        case .code: return ["codeblock", "snippet"]
        case .divider: return ["hr", "line", "separator"]
        case .toggle: return ["collapse", "details", "disclosure"]
        case .callout: return ["note", "info", "tip"]
        }
    }

    /// Fuzzy prefix match: the query prefixes the title, a title word, or a keyword (best first),
    /// else its letters appear in order in the title starting at the title's first letter.
    public static func matching(_ query: String) -> [SlashCommand] {
        let q = query.lowercased().trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return allCases }
        var scored: [(SlashCommand, Int)] = []
        for command in allCases {
            let title = command.title.lowercased()
            let compact = title.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "-", with: "")
            let words = title.split(whereSeparator: { $0 == " " || $0 == "-" }).map(String.init)
            let score: Int?
            if title.hasPrefix(q) || compact.hasPrefix(q) { score = 0 }
            else if words.contains(where: { $0.hasPrefix(q) }) { score = 1 }
            else if command.keywords.contains(where: { $0.hasPrefix(q) }) { score = 2 }
            else if q.first == compact.first, isSubsequence(q, of: compact) { score = 3 }
            else { score = nil }
            if let score { scored.append((command, score)) }
        }
        return scored.enumerated()
            .sorted { ($0.element.1, $0.offset) < ($1.element.1, $1.offset) }
            .map(\.element.0)
    }

    private static func isSubsequence(_ needle: String, of haystack: String) -> Bool {
        var it = haystack.makeIterator()
        for ch in needle {
            var found = false
            while let h = it.next() { if h == ch { found = true; break } }
            if !found { return false }
        }
        return true
    }

    /// The kind a block of `current` kind becomes (callouts keep their icon).
    public func kind(from current: ParagraphKind) -> ParagraphKind {
        switch self {
        case .text: return .paragraph
        case .heading1: return .heading1
        case .heading2: return .heading2
        case .heading3: return .heading3
        case .toDo: return .toDo(checked: false)
        case .bulleted: return .bulleted
        case .numbered: return .numbered
        case .quote: return .quote
        case .code:
            if case .code = current { return current }
            return .code(language: "plain text")
        case .divider: return .divider
        case .toggle: return .toggle
        case .callout:
            if case .callout = current { return current }
            return .callout(icon: ParagraphKind.defaultCalloutIcon)
        }
    }
}
