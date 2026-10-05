import Testing
import AppKit
@testable import NotionKit

/// End to end: load a page from a fake Notion, edit the document exactly the way the NSTextView
/// does (NSTextStorage character edits → the document's storage delegate → the engine), sync, and
/// assert the exact HTTP requests — then refetch and check the server really holds the result.
@MainActor
@Suite("PageEditorEngine — saving against a fake Notion", .serialized)
struct PageEditorEngineTests {
    private func makeEngine(debounce: TimeInterval = 0.7, backups: URL? = nil) -> PageEditorEngine {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("notiondock-tests-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let client = NotionClient(tokenProvider: { "test-token" }, session: FakeNotionServer.session, backoffBase: 0.01)
        return PageEditorEngine(
            pageId: "page-1", client: client,
            writeQueue: WriteQueue(fileURL: dir.appendingPathComponent("pending.json")),
            cache: Cache(directory: dir), cacheKey: "pin-1",
            debounce: debounce, remoteQuietPeriod: 0, retryInterval: 600,
            backupDirectory: backups ?? dir.appendingPathComponent("backups")
        )
    }

    private func seedPage() {
        FakeNotionServer.reset()
        FakeNotionServer.seed(parent: "page-1", [
            (id: "h", type: "heading_1", text: "Title", extra: [:]),
            (id: "p1", type: "paragraph", text: "Hello world", extra: [:]),
            (id: "e1", type: "paragraph", text: "", extra: [:]),
            (id: "t1", type: "to_do", text: "Buy milk", extra: ["checked": false]),
            (id: "db", type: "child_database", text: nil, extra: ["title": "Tasks"]),
            (id: "b1", type: "bulleted_list_item", text: "Parent", extra: [:]),
            (id: "p5", type: "paragraph", text: "Last", extra: [:]),
            (id: "e2", type: "paragraph", text: "", extra: [:]),
        ])
        FakeNotionServer.seed(parent: "b1", [(id: "c1", type: "bulleted_list_item", text: "Child", extra: [:])])
    }

    private func location(_ doc: EditorDocument, of needle: String) -> Int {
        let range = (doc.storage.string as NSString).range(of: needle)
        precondition(range.location != NSNotFound, "\(needle) not in document")
        return range.location
    }

    /// Types `text` one character at a time (each keystroke is one storage edit).
    private func type(_ doc: EditorDocument, _ text: String, at location: Int) {
        var loc = location
        for ch in text {
            let s = String(ch)
            doc.storage.replaceCharacters(in: NSRange(location: loc, length: 0), with: s)
            loc += (s as NSString).length
        }
    }

    private func replace(_ doc: EditorDocument, _ location: Int, _ length: Int, with text: String) {
        doc.storage.replaceCharacters(in: NSRange(location: location, length: length), with: text)
    }

    private func value(_ root: AnyHashable?, _ path: Any...) -> AnyHashable? { value(root, path: path) }
    private func string(_ root: AnyHashable?, _ path: Any...) -> String? { value(root, path: path) as? String }

    private func value(_ root: AnyHashable?, path: [Any]) -> AnyHashable? {
        var current = root
        for key in path {
            if let k = key as? String { current = (current as? [String: AnyHashable])?[k] }
            else if let i = key as? Int { let array = current as? [AnyHashable]; current = (array.map { i < $0.count ? $0[i] : nil }) ?? nil }
        }
        return current
    }

    @Test("load keeps empty lines; edits produce exactly the right PATCH/DELETE requests; server matches")
    func editsAreSaved() async throws {
        seedPage()
        let engine = makeEngine()
        await engine.load()
        let doc = engine.document
        #expect(doc.storage.string == "Title\nHello world\n\nBuy milk\n\u{FFFC}\nParent\nChild\nLast\n")
        #expect(doc.paragraphs().map(\.blockID) == ["h", "p1", "e1", "t1", "db", "b1", "c1", "p5", "e2"])
        FakeNotionServer.clearLog()

        // 1. edit mid-line, 2. Enter at end of it + type a new line, 3. check the to-do,
        // 4. delete the "Last" line (triple-click + delete).
        type(doc, " brave", at: location(doc, of: "Hello world") + 5)
        let lineEnd = location(doc, of: "Hello brave world") + 17
        replace(doc, lineEnd, 0, with: "\n")
        type(doc, "New line", at: lineEnd + 1)
        TestEditorHost(document: doc).commands.toggleCheckbox(paragraphAt: location(doc, of: "Buy milk"))
        replace(doc, location(doc, of: "Last\n"), 5, with: "")
        #expect(engine.status == .saving)

        await engine.syncNow()

        let writes = FakeNotionServer.writes
        #expect(writes.map(\.description) == [
            "PATCH /v1/blocks/p1",
            "PATCH /v1/blocks/page-1/children",
            "PATCH /v1/blocks/t1",
            "DELETE /v1/blocks/p5",
        ])
        guard writes.count == 4 else { return }
        #expect(string(writes[0].body, "paragraph", "rich_text", 0, "text", "content") == "Hello brave world")
        #expect(string(writes[1].body, "position", "type") == "after_block")
        #expect(string(writes[1].body, "position", "after_block", "id") == "p1")
        #expect(string(writes[1].body, "children", 0, "type") == "paragraph")
        #expect(string(writes[1].body, "children", 0, "paragraph", "rich_text", 0, "text", "content") == "New line")
        #expect(value(writes[2].body, "to_do", "checked") == AnyHashable(true))
        #expect(string(writes[2].body, "to_do", "rich_text", 0, "text", "content") == "Buy milk")

        #expect(engine.status == .saved)
        #expect(doc.paragraphs().map(\.blockID) == ["h", "p1", "new-1", "e1", "t1", "db", "b1", "c1", "e2"])
        #expect(FakeNotionServer.childIDs(of: "page-1") == ["h", "p1", "new-1", "e1", "t1", "db", "b1", "e2"])
        #expect(try await engine.fetchDocument() == engine.previous)

        // Nothing left to do: a second sync sends nothing.
        FakeNotionServer.clearLog()
        await engine.syncNow()
        #expect(FakeNotionServer.writes.isEmpty)

        // The inserted block is now tracked by id: typing in it updates it in place.
        type(doc, "!", at: location(doc, of: "New line") + 8)
        await engine.syncNow()
        #expect(FakeNotionServer.writes.map(\.description) == ["PATCH /v1/blocks/new-1"])
        #expect(FakeNotionServer.plainText(of: "new-1") == "New line!")
    }

    @Test("new empty lines are saved as empty blocks and survive a remote refresh")
    func emptyLinesAreSaved() async throws {
        seedPage()
        let engine = makeEngine()
        await engine.load()
        let doc = engine.document
        FakeNotionServer.clearLog()

        let titleEnd = location(doc, of: "Title") + 5
        replace(doc, titleEnd, 0, with: "\n")
        replace(doc, titleEnd + 1, 0, with: "\n")
        await engine.syncNow()

        let writes = FakeNotionServer.writes
        #expect(writes.map(\.description) == ["PATCH /v1/blocks/page-1/children"])
        #expect((value(writes.first?.body, "children") as? [AnyHashable])?.count == 2)
        #expect((value(writes.first?.body, "children", 0, "paragraph", "rich_text") as? [AnyHashable])?.isEmpty == true)
        #expect(string(writes.first?.body, "position", "after_block", "id") == "h")

        // Someone edits another block in Notion; the idle editor applies it and the empty lines stay.
        FakeNotionServer.remoteEdit("p1", text: "Hello from Notion")
        await engine.refreshFromServer()
        #expect(doc.storage.string == "Title\n\n\nHello from Notion\n\nBuy milk\n\u{FFFC}\nParent\nChild\nLast\n")
        #expect(doc.paragraphs().map(\.blockID) == ["h", "new-1", "new-2", "p1", "e1", "t1", "db", "b1", "c1", "p5", "e2"])
    }

    @Test("nested insert goes under its parent; indenting a line recreates it under the parent")
    func nesting() async throws {
        seedPage()
        let engine = makeEngine()
        await engine.load()
        let doc = engine.document
        FakeNotionServer.clearLog()

        // Enter after "Child" (list continuation inserts "\n\t- ") and type.
        let host = TestEditorHost(document: doc)
        host.caret(at: location(doc, of: "Child\n") + 5)
        host.enter() // continues the nested bullet
        host.type("Child 2")
        await engine.syncNow()
        #expect(FakeNotionServer.writes.map(\.description) == ["PATCH /v1/blocks/b1/children"])
        #expect(string(FakeNotionServer.writes.first?.body, "position", "after_block", "id") == "c1")
        #expect(FakeNotionServer.childIDs(of: "b1") == ["c1", "new-1"])

        // Tab at the start of "Last" nests it under "Parent" (after "Child 2").
        FakeNotionServer.clearLog()
        host.caret(at: location(doc, of: "Last"))
        host.commands.indent(outdent: false)
        await engine.syncNow()
        #expect(FakeNotionServer.writes.map(\.description) == ["PATCH /v1/blocks/b1/children", "DELETE /v1/blocks/p5"])
        #expect(string(FakeNotionServer.writes.first?.body, "position", "after_block", "id") == "new-1")
        #expect(FakeNotionServer.childIDs(of: "b1") == ["c1", "new-1", "new-2"])
        #expect(try await engine.fetchDocument() == engine.previous)
    }

    @Test("an edit is saved by the 700 ms debounce alone (no explicit sync)")
    func debounceFires() async throws {
        seedPage()
        let engine = makeEngine()
        await engine.load()
        FakeNotionServer.clearLog()
        type(engine.document, "!", at: location(engine.document, of: "Hello world") + 11)
        try await Task.sleep(nanoseconds: 300_000_000)
        #expect(FakeNotionServer.writes.isEmpty, "debounced, not sent per keystroke")
        try await Task.sleep(nanoseconds: 1_500_000_000)
        #expect(FakeNotionServer.writes.map(\.description) == ["PATCH /v1/blocks/p1"])
        #expect(engine.status == .saved)
    }

    @Test("a network failure is surfaced (offline), not swallowed, and the next sync retries it")
    func transientFailure() async throws {
        seedPage()
        let engine = makeEngine()
        await engine.load()
        FakeNotionServer.clearLog()
        type(engine.document, "?", at: location(engine.document, of: "Hello world") + 11)
        FakeNotionServer.failNextWrites(4) // the client itself retries a network error 3 times first
        await engine.syncNow()
        #expect({ if case .offline = engine.status { return true }; return false }())
        #expect(engine.previous.first(where: { $0.blockID == "p1" })?.content == "Hello world")
        #expect(engine.hasUnsyncedChanges)

        await engine.syncNow()
        #expect(FakeNotionServer.writes.map(\.description) == ["PATCH /v1/blocks/p1"])
        #expect(FakeNotionServer.plainText(of: "p1") == "Hello world?")
        #expect(engine.status == .saved)
    }

    @Test("a pass that deletes a block writes a backup of the previous page first; edits alone do not")
    func backupBeforeDelete() async throws {
        seedPage()
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("brink-engine-backups-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let engine = makeEngine(backups: dir)
        await engine.load()
        let doc = engine.document
        func backupFiles() -> [URL] {
            ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []).filter { $0.pathExtension == "md" }
        }
        type(doc, "!", at: location(doc, of: "Hello world"))
        await engine.syncNow()
        #expect(backupFiles().isEmpty)

        replace(doc, location(doc, of: "Last\n"), 5, with: "")
        await engine.syncNow()
        let files = backupFiles()
        #expect(files.count == 1)
        let text = try String(contentsOf: #require(files.first), encoding: .utf8)
        #expect(text.contains("Last"))
        #expect(text.contains("# Title"))
    }

    @Test("deleting a token chip line never deletes the block; the chip is restored")
    func tokenIsRestored() async throws {
        seedPage()
        let engine = makeEngine()
        await engine.load()
        let doc = engine.document
        FakeNotionServer.clearLog()
        replace(doc, location(doc, of: "\u{FFFC}\n"), 2, with: "")
        await engine.syncNow()
        #expect(FakeNotionServer.writes.isEmpty)
        #expect(doc.paragraphs().map(\.blockID) == ["h", "p1", "e1", "t1", "db", "b1", "c1", "p5", "e2"])
        #expect(engine.restoredTokenHint != nil)
    }

    @Test("select-all + delete is held back until confirmed")
    func massDelete() async throws {
        seedPage()
        let engine = makeEngine()
        await engine.load()
        let doc = engine.document
        FakeNotionServer.clearLog()
        // Keep the chip (tokens are never deleted); wipe everything else.
        let chip = location(doc, of: "\u{FFFC}")
        replace(doc, chip + 1, doc.storage.length - chip - 1, with: "")
        replace(doc, 0, chip, with: "")
        await engine.syncNow()
        #expect(FakeNotionServer.writes.isEmpty)
        #expect((engine.pendingMassDelete ?? 0) >= 3)

        engine.confirmMassDelete()
        for _ in 0..<100 where FakeNotionServer.childIDs(of: "page-1") != ["db"] || engine.isSyncing {
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        #expect(FakeNotionServer.writes.contains { $0.method == "DELETE" })
        #expect(FakeNotionServer.childIDs(of: "page-1") == ["db"])
    }

    @Test("toggle with 2 children and a callout edit are saved with the right shapes; cover is read")
    func toggleAndCallout() async throws {
        seedPage()
        FakeNotionServer.seed(parent: "page-1", [
            (id: "k", type: "callout", text: "Heads up", extra: ["icon": ["type": "external", "external": ["url": "https://x.example/i.png"]]]),
        ])
        FakeNotionServer.seedPage("page-1", json: ["object": "page", "id": "page-1", "cover": ["type": "external", "external": ["url": "https://img.example/cover.jpg"]]])
        let engine = makeEngine()
        await engine.load()
        let doc = engine.document
        #expect(engine.cover?.url.absoluteString == "https://img.example/cover.jpg")
        #expect(doc.paragraphs().last?.kind == .callout(icon: ""))
        FakeNotionServer.clearLog()

        // Edit the callout's text (its external icon must not be touched).
        type(doc, "!", at: location(doc, of: "Heads up") + 8)
        // New toggle after "Title" with two children (Enter, text, override, then indented lines).
        let titleEnd = location(doc, of: "Title") + 5
        replace(doc, titleEnd, 0, with: "\nDetails")
        doc.setStyle(kind: .toggle, depth: 0, forParagraphAt: titleEnd + 1)
        replace(doc, titleEnd + 8, 0, with: "\none\ntwo")
        doc.setStyle(kind: .paragraph, depth: 1, forParagraphAt: titleEnd + 9)
        doc.setStyle(kind: .paragraph, depth: 1, forParagraphAt: titleEnd + 13)
        await engine.syncNow()

        let writes = FakeNotionServer.writes
        #expect(writes.map(\.description) == [
            "PATCH /v1/blocks/page-1/children",
            "PATCH /v1/blocks/new-1/children",
            "PATCH /v1/blocks/k",
        ])
        guard writes.count == 3 else { return }
        #expect(string(writes[0].body, "children", 0, "type") == "toggle")
        #expect(string(writes[0].body, "children", 0, "toggle", "rich_text", 0, "text", "content") == "Details")
        #expect(string(writes[0].body, "position", "after_block", "id") == "h")
        #expect((value(writes[1].body, "children") as? [AnyHashable])?.count == 2)
        #expect(string(writes[1].body, "position", "type") == "start")
        #expect(string(writes[2].body, "callout", "rich_text", 0, "text", "content") == "Heads up!")
        #expect(value(writes[2].body, "callout", "icon") == nil)
        #expect(FakeNotionServer.childIDs(of: "new-1") == ["new-2", "new-3"])
        #expect(try await engine.fetchDocument() == engine.previous)
    }

    @Test("a to-do typed via \"[] \" is saved as to_do, with no prefix in its rich text")
    func typedTodoIsSaved() async throws {
        seedPage()
        let engine = makeEngine()
        await engine.load()
        let doc = engine.document
        FakeNotionServer.clearLog()
        let host = TestEditorHost(document: doc)
        host.caret(at: location(doc, of: "Hello world") + 11)
        host.enter()
        host.type("[] Call **mom**")
        #expect(doc.paragraphs()[2].kind == .toDo(checked: false))
        await engine.syncNow()

        let writes = FakeNotionServer.writes
        #expect(writes.map(\.description) == ["PATCH /v1/blocks/page-1/children"])
        #expect(string(writes.first?.body, "children", 0, "type") == "to_do")
        #expect(value(writes.first?.body, "children", 0, "to_do", "checked") == AnyHashable(false))
        #expect(string(writes.first?.body, "children", 0, "to_do", "rich_text", 0, "text", "content") == "Call ")
        #expect(string(writes.first?.body, "children", 0, "to_do", "rich_text", 1, "text", "content") == "mom")
        #expect(value(writes.first?.body, "children", 0, "to_do", "rich_text", 1, "annotations", "bold") == AnyHashable(true))
        #expect(FakeNotionServer.plainText(of: "new-1") == "Call mom")
        #expect(try await engine.fetchDocument() == engine.previous)
    }
}
