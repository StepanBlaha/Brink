import Foundation

/// Parses Markdown text into Notion blocks and inline rich-text spans. Deliberately small: it
/// covers the block/inline syntax v1 needs (see BRIEF §4.4/§6.1) and nothing more.
public enum MarkdownParser {

    // MARK: - Block level

    /// Splits multi-line Markdown into the blocks it describes. Blank lines separate blocks but
    /// create nothing themselves; everything that isn't a recognized prefix becomes a paragraph.
    public static func blocks(from markdown: String) -> [NewBlock] {
        var result: [NewBlock] = []
        let lines = markdown.components(separatedBy: "\n")
        var i = 0
        while i < lines.count {
            let line = lines[i]

            if line.isEmpty {
                i += 1
                continue
            }

            if line.hasPrefix("```") {
                let language = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                var codeLines: [String] = []
                i += 1
                while i < lines.count, !lines[i].hasPrefix("```") {
                    codeLines.append(lines[i])
                    i += 1
                }
                if i < lines.count { i += 1 } // consume the closing fence
                let content = codeLines.joined(separator: "\n")
                result.append(.formatted(
                    .code,
                    richText: content.isEmpty ? [] : [RichTextSpan(text: content)],
                    language: language.isEmpty ? "plain text" : language
                ))
                continue
            }

            if line.trimmingCharacters(in: .whitespaces) == "---" {
                result.append(.formatted(.divider, richText: []))
                i += 1
                continue
            }

            result.append(blockForLine(line))
            i += 1
        }
        return result
    }

    /// Detects whether `line` begins with a block-level Markdown prefix (heading/list/to-do/quote),
    /// for converting an existing paragraph's type as the user types. `nil` for plain text or a
    /// fenced code fence/divider line, which single-line conversion doesn't handle.
    public static func detectPrefixedBlock(_ line: String) -> NewBlock? {
        guard !line.hasPrefix("```"), line.trimmingCharacters(in: .whitespaces) != "---" else { return nil }
        let block = blockForLine(line)
        if case .formatted(let kind, _, _, _) = block, kind != .paragraph {
            return block
        }
        return nil
    }

    private static func blockForLine(_ line: String) -> NewBlock {
        if let rest = stripPrefix(line, "### ") { return .formatted(.heading3, richText: spans(from: rest)) }
        if let rest = stripPrefix(line, "## ") { return .formatted(.heading2, richText: spans(from: rest)) }
        if let rest = stripPrefix(line, "# ") { return .formatted(.heading1, richText: spans(from: rest)) }

        if let rest = stripToDo(line, checked: true) { return .formatted(.toDo, richText: spans(from: rest), checked: true) }
        if let rest = stripToDo(line, checked: false) { return .formatted(.toDo, richText: spans(from: rest), checked: false) }

        if let rest = stripPrefix(line, "> ") { return .formatted(.quote, richText: spans(from: rest)) }

        if let rest = stripPrefix(line, "- ") { return .formatted(.bulletedListItem, richText: spans(from: rest)) }
        if let rest = stripPrefix(line, "* ") { return .formatted(.bulletedListItem, richText: spans(from: rest)) }
        if let rest = stripPrefix(line, "+ ") { return .formatted(.bulletedListItem, richText: spans(from: rest)) }

        if let rest = stripNumbered(line) { return .formatted(.numberedListItem, richText: spans(from: rest)) }

        return .formatted(.paragraph, richText: spans(from: line))
    }

    private static func stripPrefix(_ line: String, _ prefix: String) -> String? {
        line.hasPrefix(prefix) ? String(line.dropFirst(prefix.count)) : nil
    }

    private static func stripToDo(_ line: String, checked: Bool) -> String? {
        let prefixes = checked
            ? ["- [x] ", "- [X] ", "[x] ", "[X] "]
            : ["- [ ] ", "[ ] ", "[] ", "- [] "]
        for prefix in prefixes where line.hasPrefix(prefix) {
            return String(line.dropFirst(prefix.count))
        }
        return nil
    }

    private static func stripNumbered(_ line: String) -> String? {
        guard let dotIndex = line.firstIndex(of: ".") else { return nil }
        let digits = line[line.startIndex..<dotIndex]
        guard !digits.isEmpty, digits.allSatisfy(\.isNumber) else { return nil }
        let afterDot = line.index(after: dotIndex)
        guard afterDot < line.endIndex, line[afterDot] == " " else { return nil }
        return String(line[line.index(after: afterDot)...])
    }

    // MARK: - Inline level

    /// Parses a single line of Markdown into rich-text spans: **bold**, __bold__, *italic*,
    /// _italic_, ~~strikethrough~~, `code`, [text](url), and nested ***bold+italic***.
    /// A marker with no matching closer is left as literal text.
    public static func spans(from text: String) -> [RichTextSpan] {
        guard !text.isEmpty else { return [] }
        let chars = Array(text)
        var result: [RichTextSpan] = []
        var buffer = ""
        var i = 0

        func flush() {
            if !buffer.isEmpty {
                result.append(RichTextSpan(text: buffer))
                buffer = ""
            }
        }

        while i < chars.count {
            if let (matched, next) = tryMatch(chars, i) {
                flush()
                result.append(contentsOf: matched)
                i = next
            } else {
                buffer.append(chars[i])
                i += 1
            }
        }
        flush()
        return result
    }

    private static func tryMatch(_ chars: [Character], _ i: Int) -> (spans: [RichTextSpan], next: Int)? {
        if let (content, next) = matchDelimited(chars, i, marker: "`") {
            return ([RichTextSpan(text: content, code: true)], next)
        }
        if let (span, next) = matchLink(chars, i) {
            return ([span], next)
        }
        if let (content, next) = matchDelimited(chars, i, marker: "***") {
            return (applying(spans(from: content), bold: true, italic: true), next)
        }
        if let (content, next) = matchDelimited(chars, i, marker: "**") {
            return (applying(spans(from: content), bold: true), next)
        }
        if let (content, next) = matchDelimited(chars, i, marker: "__") {
            return (applying(spans(from: content), bold: true), next)
        }
        if let (content, next) = matchDelimited(chars, i, marker: "~~") {
            return (applying(spans(from: content), strikethrough: true), next)
        }
        if let (content, next) = matchDelimited(chars, i, marker: "*") {
            return (applying(spans(from: content), italic: true), next)
        }
        if let (content, next) = matchDelimited(chars, i, marker: "_") {
            return (applying(spans(from: content), italic: true), next)
        }
        return nil
    }

    private static func applying(_ spans: [RichTextSpan], bold: Bool = false, italic: Bool = false, strikethrough: Bool = false) -> [RichTextSpan] {
        spans.map { span in
            var span = span
            if bold { span.bold = true }
            if italic { span.italic = true }
            if strikethrough { span.strikethrough = true }
            return span
        }
    }

    /// Finds `marker` opening at `i` and its next (non-overlapping, non-empty-content) closing
    /// occurrence, returning the text between them and the index just past the close.
    private static func matchDelimited(_ chars: [Character], _ i: Int, marker: String) -> (content: String, next: Int)? {
        let markerChars = Array(marker)
        let length = markerChars.count
        guard i + length <= chars.count, Array(chars[i..<i + length]) == markerChars else { return nil }
        var j = i + length
        while j + length <= chars.count {
            if Array(chars[j..<j + length]) == markerChars {
                guard j > i + length else { return nil } // no empty-content matches
                return (String(chars[(i + length)..<j]), j + length)
            }
            j += 1
        }
        return nil
    }

    /// Matches `[text](url)`. The label is kept literal (no nested inline parsing).
    private static func matchLink(_ chars: [Character], _ i: Int) -> (span: RichTextSpan, next: Int)? {
        guard chars[i] == "[" else { return nil }
        guard let closeBracket = chars[(i + 1)...].firstIndex(of: "]") else { return nil }
        guard closeBracket + 1 < chars.count, chars[closeBracket + 1] == "(" else { return nil }
        guard let closeParen = chars[(closeBracket + 2)...].firstIndex(of: ")") else { return nil }
        let label = String(chars[(i + 1)..<closeBracket])
        let urlString = String(chars[(closeBracket + 2)..<closeParen])
        guard !urlString.isEmpty, let url = URL(string: urlString) else { return nil }
        return (RichTextSpan(text: label, link: url), closeParen + 1)
    }
}
