import Testing
import AppKit
@testable import NotionKit

/// Identity tracking through the real NSTextStorage delegate path: every edit here is a plain
/// `storage.replaceCharacters`, exactly what NSTextView typing/paste/undo does underneath.
@MainActor
@Suite("EditorDocument — paragraph identity")
struct EditorDocumentTests {
    private func makeDoc(_ blocks: [SyncedParagraph]) -> EditorDocument {
        let doc = EditorDocument()
        doc.load(blocks, preserveSelection: false)
        return doc
    }

    private func p(_ id: String, _ content: String, _ kind: ParagraphKind = .paragraph, parent: String? = nil) -> SyncedParagraph {
        SyncedParagraph(blockID: id, parentID: parent, kind: kind, content: content)
    }

    private func type(_ doc: EditorDocument, _ text: String, at location: Int) {
        // Character by character, like typing.
        var loc = location
        for ch in text {
            let s = String(ch)
            doc.storage.replaceCharacters(in: NSRange(location: loc, length: 0), with: s)
            loc += (s as NSString).length
        }
    }

    @Test("empty paragraphs load as empty lines and survive the round trip with their ids")
    func emptyLinesRoundTrip() {
        let blocks = [p("a", "A"), p("e1", ""), p("e2", ""), p("b", "B"), p("e3", "")]
        let doc = makeDoc(blocks)
        #expect(doc.storage.string == "A\n\n\nB\n")
        let paragraphs = doc.paragraphs()
        #expect(paragraphs.map(\.blockID) == ["a", "e1", "e2", "b", "e3"])
        #expect(paragraphs.map(\.content) == ["A", "", "", "B", ""])
        #expect(EditorSyncPlanner.plan(previous: blocks, current: paragraphs).isEmpty)

        // Typing elsewhere doesn't drop any of them.
        type(doc, "!", at: 1)
        #expect(doc.paragraphs().map(\.blockID) == ["a", "e1", "e2", "b", "e3"])
    }

    @Test("Enter mid-line: the first half keeps the id, the second half is new")
    func enterMidLine() {
        let doc = makeDoc([p("a", "HelloWorld"), p("b", "B")])
        doc.storage.replaceCharacters(in: NSRange(location: 5, length: 0), with: "\n")
        let paragraphs = doc.paragraphs()
        #expect(paragraphs.map(\.content) == ["Hello", "World", "B"])
        #expect(paragraphs.map(\.blockID) == ["a", nil, "b"])
    }

    @Test("Enter at the start of a line: the line keeps its id, the empty line above is new")
    func enterAtStart() {
        let doc = makeDoc([p("a", "Hello")])
        doc.storage.replaceCharacters(in: NSRange(location: 0, length: 0), with: "\n")
        #expect(doc.paragraphs().map(\.blockID) == [nil, "a"])
    }

    @Test("Enter at end then typing: one new paragraph whose local id is stable while typing")
    func enterAtEndThenType() {
        let doc = makeDoc([p("a", "A"), p("b", "B")])
        doc.storage.replaceCharacters(in: NSRange(location: 1, length: 0), with: "\n")
        let afterEnter = doc.paragraphs()
        #expect(afterEnter.map(\.blockID) == ["a", nil, "b"])
        type(doc, "new", at: 2)
        let afterTyping = doc.paragraphs()
        #expect(afterTyping.map(\.content) == ["A", "new", "B"])
        #expect(afterTyping.map(\.blockID) == ["a", nil, "b"])
        #expect(afterTyping[1].localID == afterEnter[1].localID)

        // The id an insert returns is stamped without touching the text.
        let before = doc.storage.string
        #expect(doc.setBlockID("n1", forLocalID: afterTyping[1].localID))
        #expect(doc.storage.string == before)
        #expect(doc.paragraphs().map(\.blockID) == ["a", "n1", "b"])
    }

    @Test("Backspace at a line start merges: the first id stays, the second disappears")
    func merge() {
        let doc = makeDoc([p("a", "Hello"), p("b", "World")])
        doc.storage.replaceCharacters(in: NSRange(location: 5, length: 1), with: "")
        let paragraphs = doc.paragraphs()
        #expect(paragraphs.map(\.content) == ["HelloWorld"])
        #expect(paragraphs.map(\.blockID) == ["a"])
    }

    @Test("pasting multiple lines: every pasted paragraph is new, neighbors keep their ids")
    func paste() {
        let doc = makeDoc([p("a", "A"), p("b", "B")])
        doc.storage.replaceCharacters(in: NSRange(location: 2, length: 0), with: "x\ny\nz\n")
        let paragraphs = doc.paragraphs()
        #expect(paragraphs.map(\.content) == ["A", "x", "y", "z", "B"])
        #expect(paragraphs.map(\.blockID) == ["a", nil, nil, nil, "b"])
        #expect(Set(paragraphs.map(\.localID)).count == 5)
    }

    @Test("typing into an empty last line keeps that block's id")
    func typeIntoTrailingEmptyLine() {
        let doc = makeDoc([p("a", "A"), p("e", "")])
        #expect(doc.storage.string == "A\n")
        type(doc, "x", at: 2)
        #expect(doc.paragraphs().map(\.blockID) == ["a", "e"])
        #expect(doc.paragraphs().map(\.content) == ["A", "x"])
    }

    @Test("deleting a whole line just above an empty last line keeps the empty line's id")
    func deleteLineAboveTrailing() {
        let doc = makeDoc([p("a", "A"), p("b", "B"), p("e", "")])
        #expect(doc.storage.string == "A\nB\n")
        doc.storage.replaceCharacters(in: NSRange(location: 2, length: 2), with: "")
        #expect(doc.paragraphs().map(\.blockID) == ["a", "e"])
    }

    @Test("text holds only content: no prefixes or tabs; kind and depth are attributes")
    func nesting() {
        let doc = makeDoc([p("a", "one", .bulleted), p("b", "two", .bulleted, parent: "a")])
        #expect(doc.storage.string == "one\ntwo")
        #expect(doc.paragraphs().map(\.kind) == [.bulleted, .bulleted])
        #expect(doc.paragraphs().map(\.depth) == [0, 1])
    }

    @Test("a token chip whose character is deleted is no longer that block; restoring puts it back")
    func tokenChip() {
        let token = SyncedParagraph(blockID: "db", kind: .token(type: "child_database", title: "Tasks"), content: "")
        let doc = makeDoc([p("a", "A"), token, p("b", "B")])
        #expect(doc.paragraphs()[1].kind == .token(type: "child_database", title: "Tasks"))
        // Delete the whole chip line.
        doc.storage.replaceCharacters(in: NSRange(location: 2, length: 2), with: "")
        #expect(doc.paragraphs().map(\.blockID) == ["a", "b"])

        doc.restoreToken(TokenInfo(blockID: "db", type: "child_database", title: "Tasks"), depth: 0, afterBlockID: "a")
        let restored = doc.paragraphs()
        #expect(restored.map(\.blockID) == ["a", "db", "b"])
        #expect(restored[1].kind.isToken)
        #expect(EditorSyncPlanner.plan(previous: [p("a", "A"), token, p("b", "B")], current: restored).isEmpty)
    }

    @Test("a line typed after a chip with inherited chip attributes is a normal new paragraph")
    func typingAfterChip() {
        let token = SyncedParagraph(blockID: "db", kind: .token(type: "child_database", title: "Tasks"), content: "")
        let doc = makeDoc([p("a", "A"), token, p("b", "B")])
        var inherited = doc.storage.attributes(at: 2, effectiveRange: nil) // like NSTextView typingAttributes
        inherited.removeValue(forKey: .attachment)
        doc.storage.replaceCharacters(in: NSRange(location: 3, length: 0), with: NSAttributedString(string: "\n", attributes: inherited))
        doc.storage.replaceCharacters(in: NSRange(location: 4, length: 0), with: NSAttributedString(string: "x", attributes: inherited))
        let paragraphs = doc.paragraphs()
        #expect(paragraphs.map(\.blockID) == ["a", "db", nil, "b"])
        #expect(paragraphs[2].kind == .paragraph)
        #expect(paragraphs[2].content == "x")
        #expect(paragraphs[1].kind.isToken)
    }

    @Test("code block is one paragraph; soft breaks inside it don't split it")
    func codeParagraph() {
        let doc = makeDoc([p("k", "a\nb", .code(language: "swift"))])
        #expect(doc.storage.string == "a\u{2028}b")
        type(doc, "\u{2028}c", at: (doc.storage.string as NSString).length)
        let paragraphs = doc.paragraphs()
        #expect(paragraphs.count == 1)
        #expect(paragraphs[0].blockID == "k")
        #expect(paragraphs[0].content == "a\nb\nc")
    }

    @Test("select all + type: one paragraph keeps an id, the rest are gone (deletes)")
    func selectAllAndType() {
        let doc = makeDoc([p("a", "A"), p("b", "B"), p("c", "C")])
        doc.storage.replaceCharacters(in: NSRange(location: 0, length: doc.storage.length), with: "x")
        let paragraphs = doc.paragraphs()
        #expect(paragraphs.count == 1)
        #expect(paragraphs[0].content == "x")
        #expect(paragraphs[0].blockID == "a")
    }
}
