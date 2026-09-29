import Testing
import AppKit
@testable import NotionKit

private func block(_ id: String, _ content: String, _ kind: ParagraphKind = .paragraph) -> SyncedParagraph {
    SyncedParagraph(blockID: id, kind: kind, content: content)
}

@MainActor
@Suite("WYSIWYG — block shortcuts")
struct BlockShortcutTests {
    @Test("typing a shortcut at a line start converts it and removes the marker", arguments: [
        ("# ", ParagraphKind.heading1), ("## ", .heading2), ("### ", .heading3), ("- ", .bulleted), ("* ", .bulleted),
        ("1. ", .numbered), ("[] ", .toDo(checked: false)), ("[ ] ", .toDo(checked: false)), ("[x] ", .toDo(checked: true)),
        ("> ", .quote), ("+ ", .toggle), ("!> ", .callout(icon: "💡")), ("```", .code(language: "plain text")),
    ])
    func convert(shortcut: String, kind: ParagraphKind) {
        let host = TestEditorHost([block("e", "")])
        host.type(shortcut)
        #expect(host.text == "")
        #expect(host.kinds == [kind])
        #expect(host.document.paragraphs()[0].blockID == "e", "still the same block")
        host.type("x")
        #expect(host.text == "x")
        #expect(host.kinds == [kind])

        // ⌘Z right after the conversion restores the literal typed text.
        let fresh = TestEditorHost([block("e", "")])
        fresh.type(shortcut)
        fresh.undo.undo()
        #expect(fresh.text == shortcut)
        #expect(fresh.kinds == [.paragraph])
    }

    @Test("\"- [ ] \" goes bullet → to-do; shortcuts only fire at the line start")
    func combosAndPosition() {
        let host = TestEditorHost([block("e", "")])
        host.type("- [ ] task")
        #expect(host.text == "task")
        #expect(host.kinds == [.toDo(checked: false)])
        let mid = TestEditorHost([block("a", "a")])
        mid.caretAtEnd()
        mid.type("# ")
        #expect(mid.text == "a# ")
        #expect(mid.kinds == [.paragraph])
    }

    @Test("\"---\" + Enter makes a divider with a new line below")
    func divider() {
        let host = TestEditorHost([block("e", "")])
        host.type("---")
        host.enter()
        #expect(host.kinds == [.divider, .paragraph])
        #expect(host.text == "\n")
    }
}

@MainActor
@Suite("WYSIWYG — inline formatting")
struct InlineShortcutTests {
    @Test("closing marker converts the run to an attribute", arguments: [
        ("**bold**", "bold", RichTextSpan(text: "bold", bold: true)),
        ("*it*", "it", RichTextSpan(text: "it", italic: true)),
        ("_it_", "it", RichTextSpan(text: "it", italic: true)),
        ("~~gone~~", "gone", RichTextSpan(text: "gone", strikethrough: true)),
        ("`x = 1`", "x = 1", RichTextSpan(text: "x = 1", code: true)),
        ("[site](https://example.com)", "site", RichTextSpan(text: "site", link: URL(string: "https://example.com"))),
    ])
    func convert(typed: String, text: String, span: RichTextSpan) {
        let host = TestEditorHost([block("a", "")])
        host.type("say " + typed)
        #expect(host.text == "say " + text)
        #expect(host.document.paragraphs()[0].spans == [RichTextSpan(text: "say "), span])
        host.type("!") // typing continues unformatted
        #expect(host.document.paragraphs()[0].spans.last == RichTextSpan(text: "!"))
    }

    @Test("unmatched or empty markers are left alone", arguments: ["2 * 3", "snake_case_name", "a ** b", "a * x*", "``", "[x](y z)"])
    func unmatched(typed: String) {
        let host = TestEditorHost([block("a", "")])
        host.type(typed)
        #expect(host.text == typed)
        #expect(host.document.paragraphs()[0].spans == [RichTextSpan(text: typed)])
    }

    @Test("⌘B on a selection → bold run → planner sends it as annotated rich text")
    func boldRunToOps() {
        let host = TestEditorHost([block("p", "plain")])
        host.selection = NSRange(location: 2, length: 3)
        host.commands.toggle(.bold)
        let paragraph = host.document.paragraphs()[0]
        #expect(paragraph.spans == [RichTextSpan(text: "pl"), RichTextSpan(text: "ain", bold: true)])
        #expect(EditorSyncPlanner.plan(previous: [block("p", "plain")], current: [paragraph]) == [
            .update(blockID: "p", kind: .paragraph, content: "pl**ain**"),
        ])
        host.commands.toggle(.bold) // again: removes it
        #expect(host.document.paragraphs()[0].spans == [RichTextSpan(text: "plain")])
    }
}

@MainActor
@Suite("WYSIWYG — Notion keys")
struct NotionKeyTests {
    @Test("Backspace at the start converts to text first, then merges")
    func backspace() {
        let host = TestEditorHost([block("a", "A"), block("b", "B", .bulleted)])
        host.caret(at: 2)
        host.backspace()
        #expect(host.kinds == [.paragraph, .paragraph])
        #expect(host.text == "A\nB")
        host.backspace()
        #expect(host.text == "AB")
        #expect(host.document.paragraphs().map(\.blockID) == ["a"])
    }

    @Test("Enter continues lists; Enter on an empty item leaves the list; headings end in text")
    func enter() {
        let host = TestEditorHost([block("a", "one", .bulleted)])
        host.caretAtEnd()
        host.enter()
        host.type("two")
        #expect(host.text == "one\ntwo")
        #expect(host.kinds == [.bulleted, .bulleted])
        host.enter()
        host.enter()
        #expect(host.kinds == [.bulleted, .bulleted, .paragraph])

        let todo = TestEditorHost([block("t", "done", .toDo(checked: true))])
        todo.caretAtEnd()
        todo.enter()
        #expect(todo.kinds == [.toDo(checked: true), .toDo(checked: false)])

        let heading = TestEditorHost([block("h", "Title", .heading1)])
        heading.caretAtEnd()
        heading.enter()
        #expect(heading.kinds == [.heading1, .paragraph])

        let mid = TestEditorHost([block("n", "onetwo", .numbered)])
        mid.caret(at: 3)
        mid.enter()
        #expect(mid.text == "one\ntwo")
        #expect(mid.kinds == [.numbered, .numbered])
        #expect(mid.document.paragraphs().map(\.blockID) == ["n", nil])
    }

    @Test("checking a to-do and editing a heading become in-place updates")
    func checkAndHeadingOps() {
        let previous = [block("h", "Title", .heading1), block("t", "task", .toDo(checked: false))]
        let host = TestEditorHost(previous)
        host.caret(at: 5)
        host.type("!")
        host.commands.toggleCheckbox(paragraphAt: 7)
        #expect(EditorSyncPlanner.plan(previous: previous, current: host.document.paragraphs()) == [
            .update(blockID: "h", kind: .heading1, content: "Title!"),
            .update(blockID: "t", kind: .toDo(checked: true), content: "task"),
        ])
    }
}

@MainActor
@Suite("WYSIWYG — numbering, paste, copy")
struct NumberingPasteTests {
    @Test("numbered lists renumber in runs, nested levels included")
    func numbering() {
        let items: [(kind: ParagraphKind, depth: Int)] = [
            (.numbered, 0), (.numbered, 0), (.numbered, 1), (.numbered, 1), (.numbered, 0), (.paragraph, 0), (.numbered, 0),
        ]
        #expect(ListNumbering.numbers(for: items) == [1, 2, 1, 2, 3, nil, 1])
    }

    @Test("pasting Markdown makes blocks and formatting; copying gives Markdown back")
    func pasteAndCopy() {
        let host = TestEditorHost([block("e", "")])
        let markdown = "# Title\n- one\n  - nested\n- [ ] task\nplain **bold**"
        host.commands.paste(markdown)
        #expect(host.text == "Title\none\nnested\ntask\nplain bold")
        let paragraphs = host.document.paragraphs()
        #expect(paragraphs.map(\.kind) == [.heading1, .bulleted, .bulleted, .toDo(checked: false), .paragraph])
        #expect(paragraphs.map(\.depth) == [0, 0, 1, 0, 0])
        #expect(paragraphs[0].blockID == "e")
        #expect(paragraphs.last?.spans == [RichTextSpan(text: "plain "), RichTextSpan(text: "bold", bold: true)])
        #expect(host.commands.markdown(for: NSRange(location: 0, length: host.document.storage.length)) == markdown)
    }
}
