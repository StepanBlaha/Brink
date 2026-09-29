import Foundation

// MARK: - Rich text runs

/// Canonical rich-text runs: the editor stores inline formatting as attributes and syncs spans
/// built from them. `key` is the comparison string the planner diffs on.
public enum SpanRuns {
    /// Merges adjacent runs with identical formatting and drops empty ones.
    public static func normalize(_ spans: [RichTextSpan]) -> [RichTextSpan] {
        var out: [RichTextSpan] = []
        for span in spans where !span.text.isEmpty {
            if var last = out.last, sameFormat(last, span) {
                last.text += span.text
                out[out.count - 1] = last
            } else {
                out.append(span)
            }
        }
        return out
    }

    static func sameFormat(_ a: RichTextSpan, _ b: RichTextSpan) -> Bool {
        a.bold == b.bold && a.italic == b.italic && a.strikethrough == b.strikethrough && a.code == b.code && a.link == b.link
    }

    /// The planner's content key for a block's rich text.
    public static func key(_ spans: [RichTextSpan], kind: ParagraphKind) -> String {
        let normalized = normalize(spans)
        switch kind {
        case .code: return normalized.map(\.text).joined()
        case .divider, .token, .image: return ""
        default: return MarkdownSerializer.markdown(from: normalized)
        }
    }

    /// Spans for a content string given as inline Markdown (plain text for code).
    public static func spans(fromContent content: String, kind: ParagraphKind) -> [RichTextSpan] {
        switch kind {
        case .code: return content.isEmpty ? [] : [RichTextSpan(text: content)]
        case .divider, .token, .image: return []
        default: return normalize(MarkdownParser.spans(from: content))
        }
    }
}

// MARK: - Block shortcuts

/// Markdown typed at the very start of a paragraph converts it (Notion-style) the moment the
/// shortcut is complete; the typed marker is removed.
public enum BlockShortcut {
    /// `typed` is the paragraph text from its start to the caret. Returns the new kind when it is
    /// exactly a complete shortcut valid for a paragraph of `current` kind.
    public static func kind(forTyped typed: String, current: ParagraphKind) -> ParagraphKind? {
        let target: ParagraphKind?
        switch typed {
        case "# ": target = .heading1
        case "## ": target = .heading2
        case "### ": target = .heading3
        case "- ", "* ": target = .bulleted
        case "[] ", "[ ] ", "- [ ] ": target = .toDo(checked: false)
        case "[x] ", "[X] ", "- [x] ": target = .toDo(checked: true)
        case "> ": target = .quote
        case "+ ": target = .toggle
        case "!> ": target = .callout(icon: ParagraphKind.defaultCalloutIcon)
        case "```": target = .code(language: "plain text")
        default:
            if typed.hasSuffix(". "), typed.dropLast(2).allSatisfy({ $0.isASCII && $0.isNumber }), typed.count >= 3, typed.count <= 5 {
                target = .numbered
            } else {
                target = nil
            }
        }
        guard let target else { return nil }
        switch current {
        case .paragraph: return target
        case .bulleted:
            // "- " already made a bullet; "[ ] " right after turns it into a to-do.
            if case .toDo = target { return target }
            return nil
        default: return nil
        }
    }
}

// MARK: - Inline shortcuts

public enum InlineStyle: Equatable, Sendable {
    case bold, italic, strikethrough, code
    case link(URL)
}

public struct InlineMatch: Equatable, Sendable {
    /// The whole marked-up run (markers included), relative to the searched text.
    public let whole: NSRange
    /// The content between the markers.
    public let inner: NSRange
    public let style: InlineStyle
}

/// `**b**`, `*i*`, `_i_`, `~~s~~`, `` `c` ``, `[label](url)` — converted when the closing marker
/// is typed. Unmatched or empty markers are left alone.
public enum InlineShortcut {
    /// Looks for a run that ends exactly at the end of `text` (the paragraph up to the caret).
    public static func match(endingAt text: String) -> InlineMatch? {
        let ns = text as NSString
        let n = ns.length
        guard n >= 3 else { return nil }
        func ch(_ i: Int) -> unichar { ns.character(at: i) }
        let last = ch(n - 1)

        if last == 0x29 /* ) */ {
            guard let regex = try? NSRegularExpression(pattern: #"\[([^\]\n]+)\]\(([^)\s]+)\)$"#),
                  let m = regex.firstMatch(in: text, range: NSRange(location: 0, length: n)),
                  let url = URL(string: ns.substring(with: m.range(at: 2))), url.scheme != nil || ns.substring(with: m.range(at: 2)).contains(".") else { return nil }
            let finalURL = url.scheme == nil ? (URL(string: "https://" + url.absoluteString) ?? url) : url
            return InlineMatch(whole: m.range, inner: m.range(at: 1), style: .link(finalURL))
        }

        // Paired markers: (marker, style). Longer markers first.
        let pairs: [(String, InlineStyle)] = [("**", .bold), ("~~", .strikethrough), ("`", .code), ("*", .italic), ("_", .italic)]
        for (marker, style) in pairs {
            let m = (marker as NSString).length
            guard n >= 2 * m + 1, ns.substring(from: n - m) == marker else { continue }
            // A single "*" closing must not be the second half of "**".
            if marker == "*", n >= 2, ch(n - 2) == 0x2A { continue }
            let closeStart = n - m
            let innerEnd = closeStart
            // Content must not end with a space.
            guard innerEnd > 0, ch(innerEnd - 1) != 0x20 else { continue }
            // Find the opening marker, scanning left.
            var i = innerEnd - m
            while i >= 0 {
                if ns.substring(with: NSRange(location: i, length: m)) == marker {
                    let innerStart = i + m
                    let valid = innerStart < innerEnd
                        && ch(innerStart) != 0x20
                        && !(marker == "*" && ((i > 0 && ch(i - 1) == 0x2A) || ch(innerStart) == 0x2A))
                        && !(marker == "_" && i > 0 && isWordChar(ch(i - 1)))
                    if valid {
                        return InlineMatch(whole: NSRange(location: i, length: n - i), inner: NSRange(location: innerStart, length: innerEnd - innerStart), style: style)
                    }
                    break
                }
                i -= 1
            }
        }
        return nil
    }

    private static func isWordChar(_ c: unichar) -> Bool {
        guard let scalar = UnicodeScalar(c) else { return false }
        return CharacterSet.alphanumerics.contains(scalar)
    }
}

// MARK: - Numbered lists

public enum ListNumbering {
    /// Display numbers for numbered-list paragraphs: runs of consecutive numbered items at the
    /// same depth count 1, 2, 3…; deeper paragraphs in between don't break a run; any other
    /// paragraph at that depth (or shallower) restarts it. `nil` for non-numbered paragraphs.
    public static func numbers(for items: [(kind: ParagraphKind, depth: Int)]) -> [Int?] {
        var counters: [Int: Int] = [:]
        var result: [Int?] = []
        for item in items {
            for key in counters.keys where key > item.depth { counters.removeValue(forKey: key) }
            if item.kind == .numbered {
                let next = (counters[item.depth] ?? 0) + 1
                counters[item.depth] = next
                result.append(next)
            } else {
                counters.removeValue(forKey: item.depth)
                result.append(nil)
            }
        }
        return result
    }
}

// MARK: - Markdown import / export (paste / copy)

public struct ImportedBlock: Equatable, Sendable {
    public var kind: ParagraphKind
    public var depth: Int
    public var spans: [RichTextSpan]
}

public enum MarkdownImport {
    /// Splits pasted Markdown into blocks: line prefixes → kinds, leading tabs / 2-space groups →
    /// depth, fenced code → one code block, inline Markdown → formatted spans.
    public static func blocks(from text: String) -> [ImportedBlock] {
        let lines = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n").components(separatedBy: "\n")
        var out: [ImportedBlock] = []
        var i = 0
        while i < lines.count {
            var line = lines[i]
            var depth = 0
            while true {
                if line.hasPrefix("\t") { line.removeFirst(); depth += 1 }
                else if line.hasPrefix("  ") { line.removeFirst(2); depth += 1 }
                else { break }
            }
            depth = min(depth, ParagraphSyntax.maxDepth)
            if line.hasPrefix("```") {
                let language = ParagraphSyntax.normalizeLanguage(String(line.dropFirst(3)))
                var code: [String] = []
                i += 1
                while i < lines.count, !lines[i].trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                    code.append(lines[i]); i += 1
                }
                i += 1
                let body = code.joined(separator: "\n")
                out.append(ImportedBlock(kind: .code(language: language), depth: depth, spans: body.isEmpty ? [] : [RichTextSpan(text: body)]))
                continue
            }
            let parsed = ParagraphSyntax.parse(line)
            out.append(ImportedBlock(kind: parsed.kind, depth: depth, spans: SpanRuns.spans(fromContent: parsed.content, kind: parsed.kind)))
            i += 1
        }
        return out
    }
}

public enum MarkdownExport {
    /// Markdown for copied paragraphs (plain text on the pasteboard).
    public static func markdown(_ paragraphs: [(kind: ParagraphKind, depth: Int, spans: [RichTextSpan])]) -> String {
        let numbers = ListNumbering.numbers(for: paragraphs.map { ($0.kind, $0.depth) })
        return paragraphs.enumerated().map { index, p in
            let indent = String(repeating: "  ", count: p.depth)
            switch p.kind {
            case .code:
                return indent + "```\n" + p.spans.map(\.text).joined() + "\n" + indent + "```"
            case .token(_, let title):
                return indent + title
            case .image(let source):
                return indent + "![image](\(ImageSource(encoded: source)?.url?.absoluteString ?? ""))"
            default:
                let body = MarkdownSerializer.markdown(from: SpanRuns.normalize(p.spans)).replacingOccurrences(of: "\n", with: "  \n" + indent)
                let line = ParagraphSyntax.render(kind: p.kind, content: "", depth: 0, number: numbers[index] ?? 1)
                return indent + line + body
            }
        }.joined(separator: "\n")
    }
}
