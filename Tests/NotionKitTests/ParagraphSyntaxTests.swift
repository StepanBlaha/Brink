import Testing
import Foundation
@testable import NotionKit

@Suite("ParagraphSyntax — one paragraph ↔ one block")
struct ParagraphSyntaxTests {
    @Test("prefixes determine the kind", arguments: [
        ("# Title", ParagraphKind.heading1, "Title"),
        ("## Sub", .heading2, "Sub"),
        ("### Small", .heading3, "Small"),
        ("- item", .bulleted, "item"),
        ("* item", .bulleted, "item"),
        ("12. item", .numbered, "item"),
        ("- [ ] task", .toDo(checked: false), "task"),
        ("- [x] done", .toDo(checked: true), "done"),
        ("> quoted", .quote, "quoted"),
        ("---", .divider, ""),
        ("plain **bold**", .paragraph, "plain **bold**"),
        ("", .paragraph, ""),
    ])
    func kinds(text: String, kind: ParagraphKind, content: String) {
        let parsed = ParagraphSyntax.parse(text)
        #expect(parsed.kind == kind)
        #expect(parsed.content == content)
    }

    @Test("leading tabs are the depth")
    func depth() {
        #expect(ParagraphSyntax.parse("\t\t- x").depth == 2)
        #expect(ParagraphSyntax.parse("\t\t\t\t- x").depth == 3)
    }

    @Test("code block is one paragraph with U+2028 line breaks")
    func code() {
        let parsed = ParagraphSyntax.parse("```swift\u{2028}let a = 1\u{2028}let b = 2")
        #expect(parsed.kind == .code(language: "swift"))
        #expect(parsed.content == "let a = 1\nlet b = 2")
        #expect(ParagraphSyntax.parse("```\u{2028}x").kind == .code(language: "plain text"))
        #expect(ParagraphSyntax.parse("```").kind == .paragraph) // not a code block until Enter
    }

    @Test("render ∘ parse round-trips every kind, including soft breaks and escapes", arguments: [
        (ParagraphKind.paragraph, "line one\nline two"),
        (.paragraph, "- not a list"),
        (.paragraph, "# not a heading"),
        (.paragraph, "\\backslash"),
        (.paragraph, "---"),
        (.paragraph, ""),
        (.heading2, "Head"),
        (.toDo(checked: true), "done"),
        (.numbered, "n"),
        (.quote, "q"),
        (.code(language: "python"), "print(1)\n\nprint(2)"),
        (.code(language: "plain text"), ""),
        (.divider, ""),
    ])
    func roundTrip(kind: ParagraphKind, content: String) {
        let text = ParagraphSyntax.render(kind: kind, content: content, depth: 1)
        #expect(!text.contains("\n"), "a block must render as exactly one paragraph")
        let parsed = ParagraphSyntax.parse(text)
        #expect(parsed.kind == kind)
        #expect(parsed.content == content)
        #expect(parsed.depth == 1)
    }

    @Test("languages: aliases normalize, unknown ones are sent as plain text")
    func languages() {
        #expect(ParagraphSyntax.normalizeLanguage("JS") == "javascript")
        #expect(ParagraphSyntax.sendableLanguage("klingon") == "plain text")
        #expect(ParagraphSyntax.sendableLanguage("Swift") == "swift")
    }
}
