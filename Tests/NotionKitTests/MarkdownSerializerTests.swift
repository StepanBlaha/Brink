import Testing
import Foundation
@testable import NotionKit

@Suite("MarkdownSerializer")
struct MarkdownSerializerTests {
    @Test("serializes a plain span")
    func plain() {
        #expect(MarkdownSerializer.markdown(from: [RichTextSpan(text: "hello")]) == "hello")
    }

    @Test("serializes bold, italic, strikethrough, code, link")
    func annotations() {
        #expect(MarkdownSerializer.markdown(from: [RichTextSpan(text: "b", bold: true)]) == "**b**")
        #expect(MarkdownSerializer.markdown(from: [RichTextSpan(text: "i", italic: true)]) == "*i*")
        #expect(MarkdownSerializer.markdown(from: [RichTextSpan(text: "s", strikethrough: true)]) == "~~s~~")
        #expect(MarkdownSerializer.markdown(from: [RichTextSpan(text: "c", code: true)]) == "`c`")
        let url = URL(string: "https://notion.so")!
        #expect(MarkdownSerializer.markdown(from: [RichTextSpan(text: "n", link: url)]) == "[n](https://notion.so)")
    }

    @Test("bold+italic serializes with the combined marker")
    func boldItalic() {
        #expect(MarkdownSerializer.markdown(from: [RichTextSpan(text: "x", bold: true, italic: true)]) == "***x***")
    }

    @Test("block prefixes")
    func prefixes() {
        #expect(MarkdownSerializer.prefix(for: .heading1) == "# ")
        #expect(MarkdownSerializer.prefix(for: .heading2) == "## ")
        #expect(MarkdownSerializer.prefix(for: .heading3) == "### ")
        #expect(MarkdownSerializer.prefix(for: .bulletedListItem) == "- ")
        #expect(MarkdownSerializer.prefix(for: .numberedListItem) == "1. ")
        #expect(MarkdownSerializer.prefix(for: .quote) == "> ")
        #expect(MarkdownSerializer.prefix(for: .toDo(checked: false)) == "- [ ] ")
        #expect(MarkdownSerializer.prefix(for: .toDo(checked: true)) == "- [x] ")
        #expect(MarkdownSerializer.prefix(for: .paragraph) == "")
    }

    @Test("markdown(for:) combines prefix and inline spans")
    func forBlock() {
        let block = Block(id: "1", type: .toDo(checked: true), hasChildren: false, richText: [RichTextSpan(text: "buy milk", bold: true)])
        #expect(MarkdownSerializer.markdown(for: block) == "- [x] **buy milk**")
    }

    // MARK: - Round trip: spans -> markdown -> spans

    @Test("round trip: mixed formatting")
    func roundTripMixed() {
        let original: [RichTextSpan] = [
            RichTextSpan(text: "plain "),
            RichTextSpan(text: "bold", bold: true),
            RichTextSpan(text: " and "),
            RichTextSpan(text: "italic", italic: true),
            RichTextSpan(text: " and "),
            RichTextSpan(text: "code", code: true),
            RichTextSpan(text: " and "),
            RichTextSpan(text: "gone", strikethrough: true),
        ]
        let md = MarkdownSerializer.markdown(from: original)
        #expect(MarkdownParser.spans(from: md) == original)
    }

    @Test("round trip: bold+italic")
    func roundTripBoldItalic() {
        let original: [RichTextSpan] = [RichTextSpan(text: "both", bold: true, italic: true)]
        let md = MarkdownSerializer.markdown(from: original)
        #expect(MarkdownParser.spans(from: md) == original)
    }

    @Test("round trip: link")
    func roundTripLink() {
        let original: [RichTextSpan] = [RichTextSpan(text: "Notion", link: URL(string: "https://notion.so"))]
        let md = MarkdownSerializer.markdown(from: original)
        #expect(MarkdownParser.spans(from: md) == original)
    }

    @Test("round trip: plain text with no annotations")
    func roundTripPlain() {
        let original: [RichTextSpan] = [RichTextSpan(text: "just some words")]
        let md = MarkdownSerializer.markdown(from: original)
        #expect(MarkdownParser.spans(from: md) == original)
    }

    @Test("round trip: block-level to-do with inline formatting")
    func roundTripBlock() {
        let block = Block(id: "1", type: .toDo(checked: false), hasChildren: false, richText: [
            RichTextSpan(text: "call "),
            RichTextSpan(text: "mom", bold: true),
        ])
        let md = MarkdownSerializer.markdown(for: block)
        #expect(md == "- [ ] call **mom**")
        // Re-parsing the full line (prefix included) should reproduce the same block shape.
        let reparsed = MarkdownParser.blocks(from: md)
        #expect(reparsed == [.formatted(.toDo, richText: block.richText, checked: false)])
    }
}
