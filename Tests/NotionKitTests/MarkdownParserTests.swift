import Testing
import Foundation
@testable import NotionKit

@Suite("MarkdownParser blocks")
struct MarkdownParserBlockTests {
    @Test("headings")
    func headings() {
        let blocks = MarkdownParser.blocks(from: "# H1\n## H2\n### H3")
        #expect(blocks.count == 3)
        #expect(blocks[0] == .formatted(.heading1, richText: [RichTextSpan(text: "H1")]))
        #expect(blocks[1] == .formatted(.heading2, richText: [RichTextSpan(text: "H2")]))
        #expect(blocks[2] == .formatted(.heading3, richText: [RichTextSpan(text: "H3")]))
    }

    @Test("bulleted list with -, *, +")
    func bulleted() {
        let blocks = MarkdownParser.blocks(from: "- one\n* two\n+ three")
        #expect(blocks.allSatisfy {
            if case .formatted(.bulletedListItem, _, _, _) = $0 { return true }
            return false
        })
    }

    @Test("numbered list ignores the actual digit")
    func numbered() {
        let blocks = MarkdownParser.blocks(from: "1. one\n7. seven")
        #expect(blocks.count == 2)
        #expect(blocks[0] == .formatted(.numberedListItem, richText: [RichTextSpan(text: "one")]))
        #expect(blocks[1] == .formatted(.numberedListItem, richText: [RichTextSpan(text: "seven")]))
    }

    @Test("to-do unchecked variants")
    func toDoUnchecked() {
        for line in ["[ ] a", "[] a", "- [ ] a"] {
            let blocks = MarkdownParser.blocks(from: line)
            #expect(blocks == [.formatted(.toDo, richText: [RichTextSpan(text: "a")], checked: false)], "line: \(line)")
        }
    }

    @Test("to-do checked variants")
    func toDoChecked() {
        for line in ["[x] a", "- [x] a"] {
            let blocks = MarkdownParser.blocks(from: line)
            #expect(blocks == [.formatted(.toDo, richText: [RichTextSpan(text: "a")], checked: true)], "line: \(line)")
        }
    }

    @Test("quote")
    func quote() {
        let blocks = MarkdownParser.blocks(from: "> a wise quote")
        #expect(blocks == [.formatted(.quote, richText: [RichTextSpan(text: "a wise quote")])])
    }

    @Test("fenced code block with language")
    func fencedCode() {
        let blocks = MarkdownParser.blocks(from: "```swift\nlet x = 1\nlet y = 2\n```")
        #expect(blocks.count == 1)
        #expect(blocks[0] == .formatted(.code, richText: [RichTextSpan(text: "let x = 1\nlet y = 2")], language: "swift"))
    }

    @Test("fenced code block with no language")
    func fencedCodeNoLanguage() {
        let blocks = MarkdownParser.blocks(from: "```\nbare\n```")
        #expect(blocks == [.formatted(.code, richText: [RichTextSpan(text: "bare")], language: "plain text")])
    }

    @Test("divider")
    func divider() {
        let blocks = MarkdownParser.blocks(from: "---")
        #expect(blocks == [.formatted(.divider, richText: [])])
    }

    @Test("blank lines separate blocks without producing empty ones")
    func blankLinesSeparate() {
        let blocks = MarkdownParser.blocks(from: "first\n\nsecond\n\n\nthird")
        #expect(blocks.count == 3)
        #expect(blocks[0] == .formatted(.paragraph, richText: [RichTextSpan(text: "first")]))
        #expect(blocks[1] == .formatted(.paragraph, richText: [RichTextSpan(text: "second")]))
        #expect(blocks[2] == .formatted(.paragraph, richText: [RichTextSpan(text: "third")]))
    }

    @Test("plain text becomes a paragraph")
    func plainParagraph() {
        let blocks = MarkdownParser.blocks(from: "just some text")
        #expect(blocks == [.formatted(.paragraph, richText: [RichTextSpan(text: "just some text")])])
    }

    @Test("multi-line input mixes block types")
    func mixed() {
        let blocks = MarkdownParser.blocks(from: "# Title\n- [ ] todo\nparagraph text")
        #expect(blocks.count == 3)
        #expect(blocks[0] == .formatted(.heading1, richText: [RichTextSpan(text: "Title")]))
        #expect(blocks[1] == .formatted(.toDo, richText: [RichTextSpan(text: "todo")], checked: false))
        #expect(blocks[2] == .formatted(.paragraph, richText: [RichTextSpan(text: "paragraph text")]))
    }

    @Test("detectPrefixedBlock recognizes a conversion prefix")
    func detectConversion() {
        #expect(MarkdownParser.detectPrefixedBlock("# Heading") != nil)
        #expect(MarkdownParser.detectPrefixedBlock("[] todo") != nil)
        #expect(MarkdownParser.detectPrefixedBlock("plain text") == nil)
        #expect(MarkdownParser.detectPrefixedBlock("---") == nil)
        #expect(MarkdownParser.detectPrefixedBlock("```swift") == nil)
    }
}

@Suite("MarkdownParser inline spans")
struct MarkdownParserSpanTests {
    @Test("plain text with no markers")
    func plain() {
        #expect(MarkdownParser.spans(from: "hello world") == [RichTextSpan(text: "hello world")])
    }

    @Test("bold with ** and __")
    func bold() {
        #expect(MarkdownParser.spans(from: "**bold**") == [RichTextSpan(text: "bold", bold: true)])
        #expect(MarkdownParser.spans(from: "__bold__") == [RichTextSpan(text: "bold", bold: true)])
    }

    @Test("italic with * and _")
    func italic() {
        #expect(MarkdownParser.spans(from: "*italic*") == [RichTextSpan(text: "italic", italic: true)])
        #expect(MarkdownParser.spans(from: "_italic_") == [RichTextSpan(text: "italic", italic: true)])
    }

    @Test("strikethrough")
    func strikethrough() {
        #expect(MarkdownParser.spans(from: "~~gone~~") == [RichTextSpan(text: "gone", strikethrough: true)])
    }

    @Test("inline code")
    func code() {
        #expect(MarkdownParser.spans(from: "`let x = 1`") == [RichTextSpan(text: "let x = 1", code: true)])
    }

    @Test("link")
    func link() {
        let spans = MarkdownParser.spans(from: "[Notion](https://notion.so)")
        #expect(spans == [RichTextSpan(text: "Notion", link: URL(string: "https://notion.so"))])
    }

    @Test("nested bold + italic via ***")
    func boldItalic() {
        #expect(MarkdownParser.spans(from: "***both***") == [RichTextSpan(text: "both", bold: true, italic: true)])
    }

    @Test("mixed plain and formatted runs")
    func mixedRuns() {
        let spans = MarkdownParser.spans(from: "plain **bold** plain")
        #expect(spans == [
            RichTextSpan(text: "plain "),
            RichTextSpan(text: "bold", bold: true),
            RichTextSpan(text: " plain"),
        ])
    }

    @Test("multiple formatted runs in one line")
    func multipleRuns() {
        let spans = MarkdownParser.spans(from: "**bold** and *italic* and `code`")
        #expect(spans == [
            RichTextSpan(text: "bold", bold: true),
            RichTextSpan(text: " and "),
            RichTextSpan(text: "italic", italic: true),
            RichTextSpan(text: " and "),
            RichTextSpan(text: "code", code: true),
        ])
    }

    @Test("unmatched marker stays literal")
    func unmatchedMarker() {
        #expect(MarkdownParser.spans(from: "this *has no closing star") == [RichTextSpan(text: "this *has no closing star")])
        #expect(MarkdownParser.spans(from: "**unterminated bold") == [RichTextSpan(text: "**unterminated bold")])
    }

    @Test("unmatched code backtick stays literal")
    func unmatchedBacktick() {
        #expect(MarkdownParser.spans(from: "one ` backtick") == [RichTextSpan(text: "one ` backtick")])
    }

    @Test("empty string yields no spans")
    func empty() {
        #expect(MarkdownParser.spans(from: "") == [])
    }

    @Test("bold containing inline code")
    func boldContainingCode() {
        let spans = MarkdownParser.spans(from: "**bold `code` text**")
        #expect(spans == [
            RichTextSpan(text: "bold ", bold: true),
            RichTextSpan(text: "code", bold: true, code: true),
            RichTextSpan(text: " text", bold: true),
        ])
    }
}
