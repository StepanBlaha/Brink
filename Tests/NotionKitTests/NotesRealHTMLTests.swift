import XCTest
@testable import NotionKit

/// HTML exactly as the Notes app returned it for notes written through `body`
/// (macOS 26, checked against a real "Brink QA" folder), not what we sent.
final class NotesRealHTMLTests: XCTestCase {
    private func settles(_ html: String, file: StaticString = #filePath, line: UInt = #line) {
        let first = NotesHTML.parse(html)
        XCTAssertTrue(first.isEditable, "\(first.unsupported)", file: file, line: line)
        XCTAssertEqual(NotesHTML.parse(NotesHTML.render(first.blocks)).blocks, first.blocks, file: file, line: line)
    }

    func testTitleIsBoldSizedSpanAndReadsAsHeading() {
        let html = "<div><b><span style=\"font-size: 24px\">Title</span></b></div>\n<div>Body line</div>\n<div>second</div>\n"
        let note = NotesHTML.parse(html)
        XCTAssertEqual(note.blocks.map(\.kind), [.heading1, .paragraph, .paragraph])
        XCTAssertEqual(note.blocks[0].spans, [RichTextSpan(text: "Title")])
        XCTAssertTrue(note.isEditable)
        settles(html)
    }

    func testHeadingSizesMapToHeadingKinds() {
        let html = "<div><b><span style=\"font-size: 24px\">T</span></b></div>\n<div><b><span style=\"font-size: 18px\">H2</span></b></div>\n<div><b>H3</b></div>\n<div>p</div>\n"
        let note = NotesHTML.parse(html)
        XCTAssertEqual(note.blocks.map(\.kind), [.heading1, .heading2, .paragraph, .paragraph])
        XCTAssertTrue(note.blocks[2].spans.first?.bold == true)
        settles(html)
    }

    func testSizedSpanMidLineDoesNotMakeHeading() {
        let note = NotesHTML.parse("<div>text <span style=\"font-size: 24px\">big</span></div>")
        XCTAssertEqual(note.blocks.map(\.kind), [.paragraph])
    }

    func testEntitiesWithoutSemicolonDecode() {
        let html = "<div>a &amp b &ltc&gt &quotq&quot \\ back   x</div>\n"
        XCTAssertEqual(NotesHTML.parse(html).blocks[0].plainText, "a & b <c> \"q\" \\ back x")
        XCTAssertEqual(NotesHTML.decodeEntities("&ampc=2"), "&c=2")
        XCTAssertEqual(NotesHTML.decodeEntities("&amp;lt;"), "&lt;")
        XCTAssertEqual(NotesHTML.decodeEntities("a &amp; b &lt; c &#65;"), "a & b < c A")
        XCTAssertEqual(NotesHTML.decodeEntities("AT&T and R&D"), "AT&T and R&D")
    }

    func testAmpersandSurvivesSaveCycles() {
        var blocks = [NoteBlock(text: "Tom & Jerry <3 \"x\"")]
        for _ in 0..<3 {
            // What Notes hands back for our `&amp;` etc.
            let notes = NotesHTML.render(blocks).replacingOccurrences(of: "&amp;", with: "&amp")
                .replacingOccurrences(of: "&lt;", with: "&lt").replacingOccurrences(of: "&gt;", with: "&gt")
            blocks = NotesHTML.parse(notes).blocks
        }
        XCTAssertEqual(blocks[0].plainText, "Tom & Jerry <3 \"x\"")
    }

    func testMonospaceReadsBackAsCourierFont() {
        let html = "<div>a <font face=\"Courier\"><span style=\"font-size: 12px\">mono</span></font> b</div>\n"
        let note = NotesHTML.parse(html)
        XCTAssertTrue(note.isEditable)
        XCTAssertEqual(note.blocks[0].spans.filter(\.code).map(\.text), ["mono"])
        settles(html)
    }

    func testLinksAreWrittenAsPlainAddresses() {
        let url = URL(string: "https://example.com/a?b=1&c=2")!
        let same = NotesHTML.render([NoteBlock(spans: [RichTextSpan(text: url.absoluteString, link: url)])])
        XCTAssertEqual(same, "<div>https://example.com/a?b=1&amp;c=2</div>")
        let named = NotesHTML.render([NoteBlock(spans: [RichTextSpan(text: "docs", link: url)])])
        XCTAssertEqual(named, "<div>docs (https://example.com/a?b=1&amp;c=2)</div>")
        XCTAssertFalse(same.contains("<a "))
        // Notes turns <a> into <u>, which would make the note read-only afterwards.
        XCTAssertFalse(NotesHTML.parse("<div>see <u>https://example.com</u></div>").isEditable)
    }

    func testNestedListsAsNotesReturnsThem() {
        let html = "<div>T</div>\n<ol>\n<li>one</li>\n<li>two</li>\n<ol>\n<li>deep</li>\n</ol>\n</ol>\n<div>after</div>\n"
        let note = NotesHTML.parse(html)
        XCTAssertEqual(note.blocks.map(\.plainText), ["T", "one", "two", "deep", "after"])
        XCTAssertEqual(note.blocks.map(\.depth), [0, 0, 0, 1, 0])
        XCTAssertEqual(note.blocks[3].kind, .numbered)
        settles(html)
    }

    func testBlankLinesAndSplitBoldFromNotes() {
        let html = "<div>Hello</div>\n<div><br></div>\n<div>plain <b>bold </b><b><i>both</i></b> end<br></div>\n"
        let note = NotesHTML.parse(html)
        XCTAssertEqual(note.blocks.map(\.plainText), ["Hello", "", "plain bold both end"])
        settles(html)
    }

    func testEmptyNewNote() {
        let note = NotesHTML.parse("<div><br></div>\n")
        XCTAssertEqual(note.blocks, [NoteBlock()])
        XCTAssertTrue(note.isEditable)
    }

    func testCzechAndEmojiPassThrough() {
        let html = "<div><b><span style=\"font-size: 24px\">Příliš žluťoučký</span></b></div>\n<div>kůň úpěl ďábelské ódy 😀<br></div>\n"
        let note = NotesHTML.parse(html)
        XCTAssertEqual(note.blocks.map(\.plainText), ["Příliš žluťoučký", "kůň úpěl ďábelské ódy 😀"])
        settles(html)
    }

    func testBackToBackListsOfDifferentTypesAreSeparated() {
        // Notes merges `<ul>..</ul><ol>..</ol>` into one bullet list, so a gap keeps the numbers.
        let blocks = [NoteBlock(kind: .bulleted, text: "a"), NoteBlock(kind: .numbered, text: "one")]
        XCTAssertEqual(NotesHTML.render(blocks), "<ul><li>a</li></ul><div><br></div><ol><li>one</li></ol>")
        // Same type stays one list; a nested other type needs no gap.
        XCTAssertEqual(NotesHTML.render([NoteBlock(kind: .numbered, text: "a"), NoteBlock(kind: .bulleted, depth: 1, text: "b")]),
                       "<ol><li>a<ul><li>b</li></ul></li></ol>")
    }
}
