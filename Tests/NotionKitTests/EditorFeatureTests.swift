import Testing
import AppKit
@testable import NotionKit

@Suite("Slash commands")
struct SlashCommandTests {
    @Test("empty query lists every command in menu order")
    func all() {
        #expect(SlashCommand.matching("") == SlashCommand.allCases)
    }

    @Test("fuzzy prefix filtering", arguments: [
        ("h", [SlashCommand.heading1, .heading2, .heading3, .divider]),
        ("head", [.heading1, .heading2, .heading3]),
        ("h2", [.heading2]),
        ("to", [.toDo, .toggle]),
        ("todo", [.toDo]),
        ("list", [.bulleted, .numbered]),
        ("call", [.callout]),
        ("note", [.callout]),
        ("hr", [.divider]),
        ("zzz", []),
    ])
    func filtering(query: String, expected: [SlashCommand]) {
        #expect(SlashCommand.matching(query) == expected)
    }

    @Test("title-prefix matches rank before keyword matches")
    func ranking() {
        let result = SlashCommand.matching("c")
        #expect(result.prefix(2) == [.code, .callout])
    }

    @Test("each command maps to its block kind; callout and code keep their settings")
    func kinds() {
        #expect(SlashCommand.heading2.kind(from: .bulleted) == .heading2)
        #expect(SlashCommand.toDo.kind(from: .paragraph) == .toDo(checked: false))
        #expect(SlashCommand.text.kind(from: .toggle) == .paragraph)
        #expect(SlashCommand.callout.kind(from: .callout(icon: "🔥")) == .callout(icon: "🔥"))
        #expect(SlashCommand.callout.kind(from: .paragraph) == .callout(icon: "💡"))
        #expect(SlashCommand.code.kind(from: .code(language: "swift")) == .code(language: "swift"))
    }

    @MainActor
    @Test("applying removes the /query text and converts the block (one undo step)")
    func apply() {
        let host = TestEditorHost([SyncedParagraph(blockID: "a", kind: .paragraph, content: "buy milk ")])
        host.caretAtEnd()
        host.type("/tod")
        host.commands.applySlash(.toDo, slashLocation: 9)
        #expect(host.text == "buy milk ")
        #expect(host.kinds == [.toDo(checked: false)])
        host.undo.undo()
        #expect(host.text == "buy milk /tod")
        #expect(host.kinds == [.paragraph])
    }

    @MainActor
    @Test("divider on an empty line becomes a divider with a new line below; with text it goes below")
    func divider() {
        let empty = TestEditorHost([SyncedParagraph(blockID: "a", kind: .paragraph, content: "")])
        empty.type("/div")
        empty.commands.applySlash(.divider, slashLocation: 0)
        #expect(empty.kinds == [.divider, .paragraph])
        let text = TestEditorHost([SyncedParagraph(blockID: "a", kind: .paragraph, content: "keep ")])
        text.caretAtEnd()
        text.type("/div")
        text.commands.applySlash(.divider, slashLocation: 5)
        #expect(text.kinds == [.paragraph, .divider, .paragraph])
        #expect(text.document.paragraphs()[0].blockID == "a")
    }
}

@Suite("Toggle & callout blocks")
struct ToggleCalloutTests {
    @Test("planner: a new toggle with 2 children → insert toggle, then both children under it")
    func createToggleWithChildren() {
        let prev = [SyncedParagraph(blockID: "a", kind: .paragraph, content: "A")]
        let toggle = DocParagraph(localID: "T", blockID: nil, kind: .toggle, content: "Details", depth: 0)
        let c1 = DocParagraph(localID: "C1", blockID: nil, kind: .paragraph, content: "one", depth: 1)
        let c2 = DocParagraph(localID: "C2", blockID: nil, kind: .bulleted, content: "two", depth: 1)
        let current = [DocParagraph(localID: "La", blockID: "a", kind: .paragraph, content: "A"), toggle, c1, c2]
        #expect(EditorSyncPlanner.plan(previous: prev, current: current) == [
            .insert(parent: .page, position: .after(blockID: "a"), paragraphs: [toggle]),
            .insert(parent: .pending(localID: "T"), position: .start, paragraphs: [c1, c2]),
        ])
    }

    @Test("planner: editing callout text is an in-place update; paragraph → callout recreates")
    func calloutOps() {
        let prev = [SyncedParagraph(blockID: "c", kind: .callout(icon: "💡"), content: "Heads up")]
        let edited = [DocParagraph(localID: "Lc", blockID: "c", kind: .callout(icon: "💡"), content: "Heads up!")]
        #expect(EditorSyncPlanner.plan(previous: prev, current: edited) == [
            .update(blockID: "c", kind: .callout(icon: "💡"), content: "Heads up!"),
        ])
        let asParagraph = [DocParagraph(localID: "Lc", blockID: "c", kind: .paragraph, content: "Heads up")]
        let ops = EditorSyncPlanner.plan(previous: prev, current: asParagraph)
        #expect(ops.count == 2)
        #expect(ops.last == .delete(blockID: "c"))
    }

    @Test("callout update only sends the icon when it changed")
    func calloutUpdatePayload() {
        let same = PageEditorEngine.blockUpdate(kind: .callout(icon: "💡"), spans: [RichTextSpan(text: "x")], previousKind: .callout(icon: "💡"))
        #expect(same == .calloutContent(richText: [RichTextSpan(text: "x")], emoji: nil))
        let changed = PageEditorEngine.blockUpdate(kind: .callout(icon: "🔥"), spans: [RichTextSpan(text: "x")], previousKind: .callout(icon: "💡"))
        #expect(changed == .calloutContent(richText: [RichTextSpan(text: "x")], emoji: "🔥"))
        let external = PageEditorEngine.blockUpdate(kind: .callout(icon: ""), spans: [RichTextSpan(text: "x")], previousKind: .paragraph)
        #expect(external == .calloutContent(richText: [RichTextSpan(text: "x")], emoji: nil))
    }

    @Test("new blocks: toggle and callout request shapes")
    func newBlockJSON() throws {
        let toggle = PageEditorEngine.newBlock(for: DocParagraph(blockID: nil, kind: .toggle, content: "T"))
        let callout = PageEditorEngine.newBlock(for: DocParagraph(blockID: nil, kind: .callout(icon: "🔥"), content: "C"))
        let toggleJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(toggle.requestJSON)) as? [String: Any]
        let calloutJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(callout.requestJSON)) as? [String: Any]
        #expect(toggleJSON?["type"] as? String == "toggle")
        #expect(((toggleJSON?["toggle"] as? [String: Any])?["rich_text"] as? [Any])?.count == 1)
        let box = calloutJSON?["callout"] as? [String: Any]
        #expect(calloutJSON?["type"] as? String == "callout")
        #expect((box?["icon"] as? [String: Any])?["emoji"] as? String == "🔥")
        #expect((box?["icon"] as? [String: Any])?["type"] as? String == "emoji")
    }

    @Test("callout blocks decode their emoji icon")
    func calloutDecoding() throws {
        let json = #"{"object":"block","id":"c","type":"callout","has_children":false,"callout":{"rich_text":[{"type":"text","text":{"content":"Hi"},"plain_text":"Hi"}],"icon":{"type":"emoji","emoji":"🔥"},"color":"gray_background"}}"#
        let block = try JSONDecoder().decode(Block.self, from: Data(json.utf8))
        #expect(block.type == .callout)
        #expect(block.icon == .emoji("🔥"))
        #expect(PageEditorEngine.kind(of: block) == .callout(icon: "🔥"))
        let toggle = Block(id: "t", type: .toggle, hasChildren: true, plainText: "Open")
        #expect(PageEditorEngine.kind(of: toggle) == .toggle)
    }
}

@MainActor
@Suite("EditorDocument — toggles & callouts")
struct EditorDocumentKindTests {
    @Test("toggle/callout load with their kind attribute, round-trip with no ops, split keeps the kind on the first half")
    func loadAndSplit() {
        let blocks = [
            SyncedParagraph(blockID: "t", kind: .toggle, content: "Details"),
            SyncedParagraph(blockID: "c1", parentID: "t", kind: .paragraph, content: "inside"),
            SyncedParagraph(blockID: "k", kind: .callout(icon: "🔥"), content: "Note"),
        ]
        let doc = EditorDocument()
        doc.load(blocks, preserveSelection: false)
        #expect(doc.storage.string == "Details\ninside\nNote")
        let paragraphs = doc.paragraphs()
        #expect(paragraphs.map(\.kind) == [.toggle, .paragraph, .callout(icon: "🔥")])
        #expect(EditorSyncPlanner.plan(previous: blocks, current: paragraphs).isEmpty)

        // Enter mid-callout: first half stays the callout, second half is a new plain paragraph.
        doc.storage.replaceCharacters(in: NSRange(location: 17, length: 0), with: "\n")
        let after = doc.paragraphs()
        #expect(after.map(\.kind) == [.toggle, .paragraph, .callout(icon: "🔥"), .paragraph])
        #expect(after.map(\.blockID) == ["t", "c1", "k", nil])
    }

    @Test("setting a paragraph kind converts the paragraph and counts as a local edit")
    func setOverride() {
        let doc = EditorDocument()
        doc.load([SyncedParagraph(blockID: "a", kind: .paragraph, content: "x")], preserveSelection: false)
        var edits = 0
        doc.onLocalEdit = { edits += 1 }
        doc.setStyle(kind: .toggle, forParagraphAt: 0)
        #expect(doc.paragraphs()[0].kind == .toggle)
        #expect(edits == 1)
        doc.setStyle(kind: .paragraph, forParagraphAt: 0)
        #expect(doc.paragraphs()[0].kind == .paragraph)
    }

    @Test("collapsing a toggle hides exactly its deeper-indented children (local only)")
    func collapse() {
        let doc = EditorDocument()
        doc.load([
            SyncedParagraph(blockID: "t", kind: .toggle, content: "T"),
            SyncedParagraph(blockID: "a", parentID: "t", kind: .paragraph, content: "a"),
            SyncedParagraph(blockID: "b", parentID: "a", kind: .paragraph, content: "b"),
            SyncedParagraph(blockID: "z", kind: .paragraph, content: "z"),
        ], preserveSelection: false)
        #expect(doc.storage.string == "T\na\nb\nz")
        let generation = doc.editGeneration
        doc.toggleCollapsed(paragraphAt: 0)
        #expect(doc.isCollapsed(paragraphAt: 0))
        #expect(doc.hiddenRanges() == [NSRange(location: 2, length: 4)]) // "a\nb\n"
        #expect(doc.storage.attribute(.notionHidden, at: 3, effectiveRange: nil) != nil)
        #expect(doc.storage.attribute(.notionHidden, at: 6, effectiveRange: nil) == nil)
        #expect(doc.editGeneration == generation, "collapsing is not an edit")
        doc.toggleCollapsed(paragraphAt: 0)
        #expect(doc.hiddenRanges().isEmpty)
        #expect(doc.storage.attribute(.notionHidden, at: 3, effectiveRange: nil) == nil)
    }
}

@Suite("Page cover")
struct PageCoverTests {
    @Test("external and Notion-hosted covers decode; icon too")
    func decode() throws {
        let external = #"{"object":"page","id":"p","cover":{"type":"external","external":{"url":"https://images.example.com/c.jpg"}},"icon":{"type":"emoji","emoji":"📚"}}"#
        let meta = try JSONDecoder().decode(PageMeta.self, from: Data(external.utf8))
        #expect(meta.cover == FileRef(url: URL(string: "https://images.example.com/c.jpg")!, expires: false))
        #expect(meta.icon == .emoji("📚"))

        let file = #"{"object":"page","id":"p","cover":{"type":"file","file":{"url":"https://s3.example.com/c.png?X-Amz-Signature=abc","expiry_time":"2026-09-28T12:00:00.000Z"}},"icon":null}"#
        let hosted = try JSONDecoder().decode(PageMeta.self, from: Data(file.utf8))
        #expect(hosted.cover?.expires == true)
        #expect(hosted.icon == nil)

        let none = #"{"object":"page","id":"p","cover":null}"#
        #expect(try JSONDecoder().decode(PageMeta.self, from: Data(none.utf8)).cover == nil)
    }

    @Test("cache key ignores the signed query string, so a refreshed URL hits the same file")
    func cacheKey() {
        let a = URL(string: "https://s3.example.com/c.png?X-Amz-Signature=abc")!
        let b = URL(string: "https://s3.example.com/c.png?X-Amz-Signature=xyz")!
        #expect(CoverCache.key(for: a) == CoverCache.key(for: b))
        #expect(CoverCache.key(for: a) != CoverCache.key(for: URL(string: "https://s3.example.com/other.png")!))
    }
}
