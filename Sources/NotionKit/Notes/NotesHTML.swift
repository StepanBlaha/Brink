import Foundation

/// One editor block of a note: kind (paragraph, heading, list item), depth (lists) and spans.
public struct NoteBlock: Equatable, Sendable {
    public var kind: ParagraphKind
    public var depth: Int
    public var spans: [RichTextSpan]

    public init(kind: ParagraphKind = .paragraph, depth: Int = 0, spans: [RichTextSpan] = []) {
        self.kind = kind
        self.depth = depth
        self.spans = spans
    }

    public init(kind: ParagraphKind = .paragraph, depth: Int = 0, text: String) {
        self.init(kind: kind, depth: depth, spans: text.isEmpty ? [] : [RichTextSpan(text: text)])
    }

    public var plainText: String { spans.map(\.text).joined() }
}

/// Why a note can't be edited safely in Brink's editor.
public enum NotesReadOnlyReason: Hashable, Sendable {
    case attachment
    case table
    case checklist
    case formatting(String)
    case other(String)

    public var message: String {
        switch self {
        case .attachment: return "attachments or images"
        case .table: return "a table"
        case .checklist: return "a checklist (Notes doesn't expose checklist state)"
        case .formatting(let what): return what
        case .other(let what): return what
        }
    }
}

public struct ParsedNote: Equatable, Sendable {
    public var blocks: [NoteBlock]
    /// Everything the editor can't round-trip. Non-empty means: show read-only.
    public var unsupported: [NotesReadOnlyReason]

    public var isEditable: Bool { unsupported.isEmpty }
    public var hasChecklist: Bool { unsupported.contains(.checklist) }

    /// "This note has a table and attachments, so it's read-only here."
    public var readOnlyMessage: String? {
        guard !unsupported.isEmpty else { return nil }
        let parts = unsupported.map(\.message).sorted()
        return "This note has \(parts.joined(separator: ", ")), so Brink shows it read-only to keep it intact."
    }
}

/// Apple Notes HTML <-> editor blocks. Supported: paragraphs, headings (h1-h3), bulleted and
/// numbered lists (nested), bold, italic, strikethrough, monospace, links. Anything else is
/// reported in `ParsedNote.unsupported` so the caller can refuse to rewrite the note.
public enum NotesHTML {
    // MARK: - Parse

    public static func parse(_ html: String) -> ParsedNote {
        var parser = Parser()
        for token in tokenize(html) { parser.feed(token) }
        return parser.finish()
    }

    // MARK: - Render

    public static func render(_ blocks: [NoteBlock]) -> String {
        var out = ""
        var open: [String] = []   // open list tags, outermost first
        var liOpen = false        // innermost <li> still open

        func closeLists(to depth: Int) {
            while open.count > depth {
                if liOpen { out += "</li>"; liOpen = false }
                out += "</\(open.removeLast())>"
                liOpen = !open.isEmpty
            }
        }

        for block in blocks {
            let list: String?
            switch block.kind {
            case .bulleted, .toDo: list = "ul"
            case .numbered: list = "ol"
            default: list = nil
            }
            guard let list else {
                closeLists(to: 0)
                out += renderBlock(block)
                continue
            }
            let depth = min(max(block.depth, 0), open.count)
            closeLists(to: depth + 1)
            if open.count == depth + 1, open[depth] != list { closeLists(to: depth) }
            if open.count == depth + 1 {
                if liOpen { out += "</li>" }
            } else {
                out += "<\(list)>"
                open.append(list)
            }
            out += "<li>" + inline(listSpans(block))
            liOpen = true
        }
        closeLists(to: 0)
        return out
    }

    /// To-dos have no scriptable Notes form, so they become plain list items with a visible box.
    private static func listSpans(_ block: NoteBlock) -> [RichTextSpan] {
        guard case .toDo(let checked) = block.kind else { return block.spans }
        return [RichTextSpan(text: checked ? "\u{2611} " : "\u{2610} ")] + block.spans
    }

    private static func renderBlock(_ block: NoteBlock) -> String {
        let body = inline(block.spans)
        let tag: String?
        switch block.kind {
        case .heading1: tag = "h1"
        case .heading2: tag = "h2"
        case .heading3: tag = "h3"
        default: tag = nil
        }
        if body.isEmpty { return "<div><br></div>" }
        if case .divider = block.kind { return "<div>---</div>" }
        if let tag { return "<div><\(tag)>\(body)</\(tag)></div>" }
        if case .code = block.kind { return "<div><tt>\(inline(block.spans.map { var s = $0; s.code = true; return s }))</tt></div>" }
        return "<div>\(body)</div>"
    }

    static func inline(_ spans: [RichTextSpan]) -> String {
        SpanRuns.normalize(spans).map { span in
            var text = escape(span.text).replacingOccurrences(of: "\n", with: "<br>")
            if span.code { text = "<tt>\(text)</tt>" }
            if span.strikethrough { text = "<strike>\(text)</strike>" }
            if span.italic { text = "<i>\(text)</i>" }
            if span.bold { text = "<b>\(text)</b>" }
            if let link = span.link { text = "<a href=\"\(escape(link.absoluteString, attribute: true))\">\(text)</a>" }
            return text
        }.joined()
    }

    static func escape(_ text: String, attribute: Bool = false) -> String {
        var t = text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
        if attribute { t = t.replacingOccurrences(of: "\"", with: "&quot;") }
        return t
    }

    /// Plain text of an HTML body (for titles and previews).
    public static func plainText(_ html: String) -> String {
        parse(html).blocks.map(\.plainText).joined(separator: "\n")
    }

    // MARK: - Tokenizer

    enum Token {
        case text(String)
        case open(String, [String: String])
        case close(String)
    }

    static func tokenize(_ html: String) -> [Token] {
        var tokens: [Token] = []
        let chars = Array(html)
        var i = 0
        var text = ""
        func flushText() {
            if !text.isEmpty { tokens.append(.text(decodeEntities(text))); text = "" }
        }
        while i < chars.count {
            let c = chars[i]
            guard c == "<" else { text.append(c); i += 1; continue }
            // Comment / doctype
            if chars[i...].starts(with: Array("<!--")) {
                flushText()
                var j = i + 4
                while j + 2 < chars.count, !(chars[j] == "-" && chars[j + 1] == "-" && chars[j + 2] == ">") { j += 1 }
                i = min(j + 3, chars.count)
                continue
            }
            guard let end = chars[i...].firstIndex(of: ">") else { text.append(c); i += 1; continue }
            let inner = String(chars[(i + 1)..<end])
            i = end + 1
            if inner.hasPrefix("!") || inner.hasPrefix("?") { flushText(); continue }
            flushText()
            if inner.hasPrefix("/") {
                tokens.append(.close(inner.dropFirst().trimmingCharacters(in: .whitespaces).lowercased()))
                continue
            }
            let (name, attrs, selfClosing) = parseTag(inner)
            tokens.append(.open(name, attrs))
            if ["style", "script", "title"].contains(name), !selfClosing {
                // Raw text element: skip to its end tag.
                let closing = Array("</\(name)")
                var j = i
                while j < chars.count, !(chars[j] == "<" && chars[j...].starts(with: closing)) { j += 1 }
                i = j
            }
            if selfClosing { tokens.append(.close(name)) }
        }
        flushText()
        return tokens
    }

    static func parseTag(_ inner: String) -> (String, [String: String], Bool) {
        var body = inner.trimmingCharacters(in: .whitespacesAndNewlines)
        var selfClosing = false
        if body.hasSuffix("/") { selfClosing = true; body.removeLast() }
        let name: String
        var rest = Substring("")
        if let space = body.firstIndex(where: { $0.isWhitespace }) {
            name = String(body[..<space]).lowercased()
            rest = body[space...]
        } else {
            name = body.lowercased()
        }
        var attrs: [String: String] = [:]
        let chars = Array(rest)
        var i = 0
        while i < chars.count {
            while i < chars.count, chars[i].isWhitespace { i += 1 }
            var key = ""
            while i < chars.count, !chars[i].isWhitespace, chars[i] != "=" { key.append(chars[i]); i += 1 }
            while i < chars.count, chars[i].isWhitespace { i += 1 }
            var value = ""
            if i < chars.count, chars[i] == "=" {
                i += 1
                while i < chars.count, chars[i].isWhitespace { i += 1 }
                if i < chars.count, chars[i] == "\"" || chars[i] == "'" {
                    let quote = chars[i]; i += 1
                    while i < chars.count, chars[i] != quote { value.append(chars[i]); i += 1 }
                    i += 1
                } else {
                    while i < chars.count, !chars[i].isWhitespace { value.append(chars[i]); i += 1 }
                }
            }
            if !key.isEmpty { attrs[key.lowercased()] = decodeEntities(value) }
        }
        let voids: Set<String> = ["br", "img", "hr", "input", "meta", "link", "col", "wbr"]
        return (name, attrs, selfClosing || voids.contains(name))
    }

    static func decodeEntities(_ s: String) -> String {
        guard s.contains("&") else { return s }
        var out = ""
        var i = s.startIndex
        while i < s.endIndex {
            if s[i] == "&", let semi = s[i...].prefix(10).firstIndex(of: ";") {
                let name = String(s[s.index(after: i)..<semi])
                var replacement: String?
                switch name {
                case "amp": replacement = "&"
                case "lt": replacement = "<"
                case "gt": replacement = ">"
                case "quot": replacement = "\""
                case "apos": replacement = "'"
                case "nbsp": replacement = " "
                default:
                    if name.hasPrefix("#x") || name.hasPrefix("#X"), let v = UInt32(name.dropFirst(2), radix: 16), let u = Unicode.Scalar(v) { replacement = String(Character(u)) }
                    else if name.hasPrefix("#"), let v = UInt32(name.dropFirst()), let u = Unicode.Scalar(v) { replacement = String(Character(u)) }
                }
                if let replacement { out += replacement; i = s.index(after: semi); continue }
            }
            out.append(s[i])
            i = s.index(after: i)
        }
        return out
    }
}
