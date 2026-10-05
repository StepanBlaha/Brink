import Foundation

extension NotesHTML {
    /// Token-driven builder behind `NotesHTML.parse`.
    struct Parser {
        private var blocks: [NoteBlock] = []
        private var unsupported: [NotesReadOnlyReason] = []

        private var spans: [RichTextSpan] = []
        private var kind: ParagraphKind = .paragraph
        private var depth = 0

        private var bold = 0, italic = 0, strike = 0, code = 0
        private var links: [URL?] = []
        private var lists: [Bool] = []          // true = ordered
        private var liOpen: [Bool] = []
        private var skipDepth = 0                 // inside <head>/<style>/…

        private static let skipped: Set<String> = ["head", "style", "script", "title"]
        private static let attachmentTags: Set<String> = ["img", "object", "embed", "video", "audio", "iframe", "canvas", "svg", "picture"]
        private static let transparent: Set<String> = ["html", "body", "font", "article", "section", "main", "meta", "link", "label"]

        mutating func feed(_ token: Token) {
            switch token {
            case .text(let text): addText(text)
            case .open(let name, let attrs): open(name, attrs)
            case .close(let name): close(name)
            }
        }

        mutating func finish() -> ParsedNote {
            flush(force: false)
            var seen = Set<NotesReadOnlyReason>()
            let reasons = unsupported.filter { seen.insert($0).inserted }
            return ParsedNote(blocks: blocks, unsupported: reasons)
        }

        // MARK: Elements

        private mutating func open(_ name: String, _ attrs: [String: String]) {
            if Self.skipped.contains(name) { skipDepth += 1; return }
            guard skipDepth == 0 else { return }
            switch name {
            case "div", "p":
                flush(force: false)
            case "h1": startBlock(.heading1)
            case "h2": startBlock(.heading2)
            case "h3": startBlock(.heading3)
            case "h4", "h5", "h6": unsupported.append(.formatting("a heading style")); startBlock(.heading3)
            case "ul", "ol":
                flush(force: false)
                lists.append(name == "ol")
                liOpen.append(false)
                let cls = (attrs["class"] ?? "").lowercased()
                if cls.contains("checklist") || cls.contains("todo") { unsupported.append(.checklist) }
                else if cls.contains("dash") { unsupported.append(.formatting("a dashed list")) }
                else if (attrs["style"] ?? "").contains("list-style") && !(attrs["style"] ?? "").contains("disc") && !(attrs["style"] ?? "").contains("decimal") {
                    unsupported.append(.formatting("a custom list style"))
                }
            case "li":
                flush(force: false)
                if lists.isEmpty { lists.append(false); liOpen.append(false) }
                let ordered = lists[lists.count - 1]
                let cls = (attrs["class"] ?? "").lowercased()
                if attrs.keys.contains(where: { $0.contains("checked") }) || cls.contains("check") || cls.contains("todo") { unsupported.append(.checklist) }
                kind = ordered ? .numbered : .bulleted
                if lists.count - 1 > ParagraphSyntax.maxDepth { unsupported.append(.formatting("deeply nested lists")) }
                depth = min(lists.count - 1, ParagraphSyntax.maxDepth)
                liOpen[liOpen.count - 1] = true
            case "br":
                if spans.isEmpty {
                    flush(force: true)
                } else {
                    flush(force: false)
                }
            case "b", "strong": bold += 1
            case "i", "em": italic += 1
            case "s", "strike", "del": strike += 1
            case "tt", "code": code += 1
            case "a":
                links.append(attrs["href"].flatMap { URL(string: $0) })
            case "span":
                let style = (attrs["style"] ?? "").lowercased()
                if style.contains("color") || style.contains("background") || style.contains("text-decoration") {
                    unsupported.append(.formatting("colored or underlined text"))
                }
            case "u", "ins": unsupported.append(.formatting("underlined text"))
            case "table", "tr", "td", "th", "tbody", "thead": unsupported.append(.table)
            case "blockquote": unsupported.append(.formatting("a block quote"))
            case "pre": unsupported.append(.formatting("a preformatted block"))
            case "hr": unsupported.append(.formatting("a divider"))
            case "sub", "sup", "mark", "small", "big", "center": unsupported.append(.formatting("special text styling"))
            default:
                if Self.attachmentTags.contains(name) { unsupported.append(.attachment) }
                else if !Self.transparent.contains(name) { unsupported.append(.other("an unsupported element (\(name))")) }
            }
        }

        private mutating func close(_ name: String) {
            if Self.skipped.contains(name) { skipDepth = max(0, skipDepth - 1); return }
            guard skipDepth == 0 else { return }
            switch name {
            case "div", "p", "h1", "h2", "h3", "h4", "h5", "h6":
                flush(force: false)
            case "li":
                flush(force: false)
                if !liOpen.isEmpty { liOpen[liOpen.count - 1] = false }
                restoreContainerKind()
            case "ul", "ol":
                flush(force: false)
                if !lists.isEmpty { lists.removeLast(); liOpen.removeLast() }
                restoreContainerKind()
            case "b", "strong": bold = max(0, bold - 1)
            case "i", "em": italic = max(0, italic - 1)
            case "s", "strike", "del": strike = max(0, strike - 1)
            case "tt", "code": code = max(0, code - 1)
            case "a": if !links.isEmpty { links.removeLast() }
            default: break
            }
        }

        private mutating func restoreContainerKind() {
            // After a list item, text directly in an enclosing <li> keeps its list kind.
            if let open = liOpen.lastIndex(of: true) {
                kind = lists[open] ? .numbered : .bulleted
                depth = min(open, ParagraphSyntax.maxDepth)
            } else {
                kind = .paragraph
                depth = 0
            }
        }

        // MARK: Text

        private mutating func addText(_ raw: String) {
            guard skipDepth == 0 else { return }
            var text = raw.replacingOccurrences(of: "[ \\t\\r\\n]+", with: " ", options: .regularExpression)
            if spans.isEmpty { text = String(text.drop(while: { $0 == " " })) }
            guard !text.isEmpty else { return }
            if spans.isEmpty, text.trimmingCharacters(in: .whitespaces).isEmpty { return }
            let link = links.last ?? nil
            spans.append(RichTextSpan(text: text, bold: bold > 0, italic: italic > 0, strikethrough: strike > 0, code: code > 0, link: link))
        }

        // MARK: Blocks

        private mutating func startBlock(_ newKind: ParagraphKind) {
            flush(force: false)
            kind = newKind
        }

        private mutating func flush(force: Bool) {
            var normalized = SpanRuns.normalize(spans)
            // Collapsed whitespace at the end of a line isn't content.
            while var last = normalized.last, last.text.hasSuffix(" ") {
                last.text.removeLast()
                if last.text.isEmpty { normalized.removeLast() } else { normalized[normalized.count - 1] = last }
            }
            let hasContent = !normalized.isEmpty
            if hasContent || force {
                blocks.append(NoteBlock(kind: kind, depth: depth, spans: normalized))
            }
            spans = []
            // A heading applies to one block only.
            if case .heading1 = kind { kind = .paragraph }
            if case .heading2 = kind { kind = .paragraph }
            if case .heading3 = kind { kind = .paragraph }
        }
    }
}
