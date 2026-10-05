import XCTest
@testable import NotionKit

// MARK: - Fakes

/// Canned replies keyed by a substring of the script; records every script it ran.
final class FakeScriptRunner: AppleScriptRunning, @unchecked Sendable {
    private let lock = NSLock()
    private var _scripts: [String] = []
    var replies: [(match: String, reply: String)] = []
    var failure: Error?

    var scripts: [String] { lock.lock(); defer { lock.unlock() }; return _scripts }

    func run(_ source: String) async throws -> String {
        lock.lock(); _scripts.append(source); lock.unlock()
        if let failure { throw failure }
        return replies.first { source.contains($0.match) }?.reply ?? "null"
    }
}

/// In-memory Notes for capture tests.
final class FakeNotes: NotesProviding, @unchecked Sendable {
    var bodies: [String: String] = [:]
    var created: [(folder: String, html: String)] = []

    func folders() async throws -> [NotesFolder] { [] }
    func notes(inFolder folderId: String) async throws -> [NotesNoteInfo] { [] }
    func searchNotes(query: String, limit: Int) async throws -> [NotesNoteInfo] { [] }
    func note(id: String) async throws -> NotesNoteContent {
        guard let html = bodies[id] else { throw NotesError.notFound }
        return NotesNoteContent(info: NotesNoteInfo(id: id, title: "t"), html: html, plaintext: "")
    }
    func createNote(inFolder folderId: String, html: String) async throws -> NotesNoteInfo {
        created.append((folderId, html))
        return NotesNoteInfo(id: "new", title: "n")
    }
    func setBody(noteId: String, html: String) async throws { bodies[noteId] = html }
    func show(noteId: String) async throws {}
    func show(folderId: String) async throws {}
}

final class NotesHTMLTests: XCTestCase {
    private func roundTrips(_ html: String, file: StaticString = #filePath, line: UInt = #line) {
        let first = NotesHTML.parse(html)
        XCTAssertTrue(first.isEditable, "\(first.unsupported)", file: file, line: line)
        let second = NotesHTML.parse(NotesHTML.render(first.blocks))
        XCTAssertEqual(first.blocks, second.blocks, file: file, line: line)
        XCTAssertTrue(second.isEditable, file: file, line: line)
    }

    func testParagraphsAndHeadings() {
        let html = "<div><h1>Title</h1></div><div>Hello world</div><div><br></div><div><h2>Part</h2></div><div><h3>Sub</h3></div>"
        let note = NotesHTML.parse(html)
        XCTAssertEqual(note.blocks.map(\.kind), [.heading1, .paragraph, .paragraph, .heading2, .heading3])
        XCTAssertEqual(note.blocks.map(\.plainText), ["Title", "Hello world", "", "Part", "Sub"])
        roundTrips(html)
    }

    func testInlineFormattingAndLinks() {
        let html = "<div>a <b>bold</b> <i>it</i> <strike>gone</strike> <tt>mono</tt> <a href=\"https://example.com/?a=1&amp;b=2\">link</a> &amp; &lt;done&gt;</div>"
        let note = NotesHTML.parse(html)
        let spans = note.blocks[0].spans
        XCTAssertTrue(spans.contains { $0.text == "bold" && $0.bold })
        XCTAssertTrue(spans.contains { $0.text == "it" && $0.italic })
        XCTAssertTrue(spans.contains { $0.text == "gone" && $0.strikethrough })
        XCTAssertTrue(spans.contains { $0.text == "mono" && $0.code })
        XCTAssertTrue(spans.contains { $0.text == "link" && $0.link?.absoluteString == "https://example.com/?a=1&b=2" })
        XCTAssertTrue(note.blocks[0].plainText.hasSuffix("& <done>"))
        roundTrips(html)
    }

    func testListsNestedAndNumbered() {
        let html = "<ul><li>one<ul><li>one-a</li><li>one-b</li></ul></li><li>two</li></ul><ol><li>first</li><li>second</li></ol><div>after</div>"
        let note = NotesHTML.parse(html)
        XCTAssertEqual(note.blocks.map(\.kind), [.bulleted, .bulleted, .bulleted, .bulleted, .numbered, .numbered, .paragraph])
        XCTAssertEqual(note.blocks.map(\.depth), [0, 1, 1, 0, 0, 0, 0])
        XCTAssertEqual(NotesHTML.render(note.blocks), html)
        roundTrips(html)
    }

    func testRenderEscapesAndBreaks() {
        let blocks = [NoteBlock(text: "1 < 2 & 3 > 2"), NoteBlock()]
        XCTAssertEqual(NotesHTML.render(blocks), "<div>1 &lt; 2 &amp; 3 &gt; 2</div><div><br></div>")
        roundTrips(NotesHTML.render(blocks))
    }

    func testBodyWrapperAndWhitespaceTolerated() {
        let html = "<html><head><style>p{margin:0}</style><title>x</title></head><body>\n  <div>One</div>\n  <div>Two<br></div>\n</body></html>"
        let note = NotesHTML.parse(html)
        XCTAssertEqual(note.blocks.map(\.plainText), ["One", "Two"])
        XCTAssertTrue(note.isEditable)
    }

    func testTodosRenderAsVisibleBoxes() {
        let html = NotesHTML.render([NoteBlock(kind: .toDo(checked: true), text: "milk"), NoteBlock(kind: .toDo(checked: false), text: "eggs")])
        XCTAssertEqual(html, "<ul><li>\u{2611} milk</li><li>\u{2610} eggs</li></ul>")
    }

    // Unknown content must be detected so the note opens read-only and is never rewritten.

    func testAttachmentsTablesAndChecklistsAreReadOnly() {
        let img = NotesHTML.parse("<div>Pic</div><div><img src=\"data:image/png;base64,AAAA\"></div>")
        XCTAssertFalse(img.isEditable)
        XCTAssertTrue(img.unsupported.contains(.attachment))
        XCTAssertEqual(img.blocks.first?.plainText, "Pic")

        let table = NotesHTML.parse("<table><tr><td>a</td><td>b</td></tr></table>")
        XCTAssertTrue(table.unsupported.contains(.table))

        let object = NotesHTML.parse("<div><object><img src=\"x\"></object></div>")
        XCTAssertTrue(object.unsupported.contains(.attachment))

        let check = NotesHTML.parse("<ul class=\"Apple-checklist\"><li>todo</li></ul>")
        XCTAssertTrue(check.hasChecklist)
        XCTAssertFalse(check.isEditable)
        XCTAssertNotNil(check.readOnlyMessage)
    }

    func testUnknownFormattingIsReadOnly() {
        XCTAssertFalse(NotesHTML.parse("<div><u>under</u></div>").isEditable)
        XCTAssertFalse(NotesHTML.parse("<div><span style=\"color: red\">x</span></div>").isEditable)
        XCTAssertFalse(NotesHTML.parse("<div><blink>x</blink></div>").isEditable)
        XCTAssertTrue(NotesHTML.parse("<div><span style=\"font-size: 14px\">ok</span></div>").isEditable)
    }

    func testPlainEditableNoteHasNoMessage() {
        XCTAssertNil(NotesHTML.parse("<div>fine</div>").readOnlyMessage)
    }
}

final class AppleNotesServiceTests: XCTestCase {
    func testFoldersDecodeAndScriptCarriesNoUserText() async throws {
        let runner = FakeScriptRunner()
        runner.replies = [("accounts()", #"[{"id":"f1","name":"Notes","account":"iCloud","noteCount":4}]"#)]
        let folders = try await AppleNotesService(runner: runner).folders()
        XCTAssertEqual(folders, [NotesFolder(id: "f1", name: "Notes", account: "iCloud", noteCount: 4)])
    }

    func testNotesAreNewestFirstAndArgsAreJSONEscaped() async throws {
        let runner = FakeScriptRunner()
        runner.replies = [("findFolder(A.id).notes", #"[{"id":"a","title":"old","modified":"2026-01-01T10:00:00.000Z"},{"id":"b","title":"new","modified":"2026-03-01T10:00:00.000Z"}]"#)]
        let notes = try await AppleNotesService(runner: runner).notes(inFolder: "x\"; evil(); \"")
        XCTAssertEqual(notes.map(\.id), ["b", "a"])
        let script = try XCTUnwrap(runner.scripts.first)
        XCTAssertTrue(script.contains(#"x\"; evil(); \""#), "id must be inside a JSON string literal")
        XCTAssertTrue(script.contains(#"const A = {"id":"x\"; evil(); \""};"#))
    }

    func testNoteBodyRoundTripThroughSetBody() async throws {
        let runner = FakeScriptRunner()
        runner.replies = [("n.plaintext()", #"{"id":"n1","title":"T","modified":"2026-03-01T10:00:00Z","html":"<div>hi</div>","plain":"hi"}"#)]
        let service = AppleNotesService(runner: runner)
        let note = try await service.note(id: "n1")
        XCTAssertEqual(note.html, "<div>hi</div>")
        try await service.setBody(noteId: "n1", html: "<div>bye &amp; so long</div>")
        XCTAssertTrue(try XCTUnwrap(runner.scripts.last).contains("bye &amp; so long"))
    }

    func testPermissionAndNotFoundErrorsMap() async {
        let runner = FakeScriptRunner()
        runner.failure = NotesError.permissionDenied
        do { _ = try await AppleNotesService(runner: runner).folders(); XCTFail() } catch { XCTAssertEqual(error as? NotesError, .permissionDenied) }
        runner.failure = NSError(domain: "x", code: 1, userInfo: [NSLocalizedDescriptionKey: "Error: NOT_FOUND"])
        do { _ = try await AppleNotesService(runner: runner).note(id: "z"); XCTFail() } catch { XCTAssertEqual(error as? NotesError, .notFound) }
    }
}

final class PinSourceTests: XCTestCase {
    func testOldPinsDecodeAsNotion() throws {
        let json = #"[{"id":"1","notionId":"abc","kind":"page","title":"Old","icon":{"none":{}},"order":0}]"#
        let pins = try JSONDecoder().decode([Pin].self, from: Data(json.utf8))
        XCTAssertEqual(pins.first?.source, .notion)
        XCTAssertFalse(pins[0].isAppleNotes)
    }

    func testAppleNotesPinRoundTripsAndUnknownSourceFallsBack() throws {
        let pin = Pin(notionId: "x-coredata://1", kind: .dataSource, title: "Ideas", icon: .none, order: 0, source: .appleNotes)
        let back = try JSONDecoder().decode(Pin.self, from: JSONEncoder().encode(pin))
        XCTAssertEqual(back, pin)
        XCTAssertEqual(back.source, .appleNotes)

        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(pin)) as! [String: Any]
        object["source"] = "someFutureThing"
        let odd = try JSONDecoder().decode(Pin.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertEqual(odd.source, .notion)
    }

    func testMiniListSkipsAppleNotesPins() {
        let notion = Pin(notionId: "a", kind: .page, title: "A", icon: .none, order: 0)
        let notes = Pin(notionId: "b", kind: .dataSource, title: "B", icon: .none, order: 1, source: .appleNotes)
        let sections = MiniList.sections(pins: [notion, notes], summaries: [:], groups: [], activeGroupID: nil)
        XCTAssertEqual(sections.map(\.pinID), [notion.id])
    }
}

final class NotesCaptureTests: XCTestCase {
    private let folder = Pin(notionId: "folder-1", kind: .dataSource, title: "Ideas", icon: .none, order: 0, source: .appleNotes)
    private let note = Pin(notionId: "note-1", kind: .page, title: "Inbox", icon: .none, order: 1, source: .appleNotes)

    func testFolderPinCreatesNoteTitledByFirstLine() {
        let plan = NotesCapture.plan(text: "  Buy milk\nand eggs  ", pin: folder)
        guard case .createNote(let folderId, let title, let html)? = plan else { return XCTFail("\(String(describing: plan))") }
        XCTAssertEqual(folderId, "folder-1")
        XCTAssertEqual(title, "Buy milk")
        XCTAssertEqual(html, "<div><h1>Buy milk</h1></div><div>and eggs</div>")
    }

    func testNotePinAppends() {
        let plan = NotesCapture.plan(text: "one\n\ntwo", pin: note)
        XCTAssertEqual(plan, .appendToNote(noteId: "note-1", blocks: [NoteBlock(text: "one"), NoteBlock(), NoteBlock(text: "two")]))
    }

    func testURLIsAppendedAsLinkAndEmptyIsNil() {
        guard case .appendToNote(_, let blocks)? = NotesCapture.plan(text: "read", url: "https://a.b/c", pin: note) else { return XCTFail() }
        XCTAssertEqual(blocks.last?.spans.first?.link?.absoluteString, "https://a.b/c")
        XCTAssertNil(NotesCapture.plan(text: " \n ", pin: note))
        XCTAssertNil(NotesCapture.plan(text: "x", pin: Pin(notionId: "n", kind: .page, title: "N", icon: .none, order: 0)))
    }

    func testLongFirstLineTruncatesButBodyKeepsIt() {
        let long = String(repeating: "word ", count: 60).trimmingCharacters(in: .whitespaces)
        guard case .createNote(_, let title, let html)? = NotesCapture.plan(text: long, pin: folder) else { return XCTFail() }
        XCTAssertTrue(title.hasSuffix("…"))
        XCTAssertTrue(html.contains(long))
    }

    func testExecuteCreatesAndAppends() async throws {
        let notes = FakeNotes()
        notes.bodies["note-1"] = "<div>existing</div>"
        try await NotesCapture.execute(try XCTUnwrap(NotesCapture.plan(text: "added", pin: note)), pinTitle: "Inbox", provider: notes)
        XCTAssertEqual(notes.bodies["note-1"], "<div>existing</div><div>added</div>")
        try await NotesCapture.execute(try XCTUnwrap(NotesCapture.plan(text: "T", pin: folder)), pinTitle: "Ideas", provider: notes)
        XCTAssertEqual(notes.created.first?.folder, "folder-1")
    }

    func testAppendRefusesNoteWithAttachments() async throws {
        let notes = FakeNotes()
        let original = "<div>x</div><div><img src=\"data:image/png;base64,AA\"></div>"
        notes.bodies["note-1"] = original
        do {
            try await NotesCapture.execute(try XCTUnwrap(NotesCapture.plan(text: "more", pin: note)), pinTitle: "Inbox", provider: notes)
            XCTFail("must refuse")
        } catch { XCTAssertEqual(error as? NotesError, .unsafeToEdit) }
        XCTAssertEqual(notes.bodies["note-1"], original, "note untouched")
    }

    func testFolderSummaryCountsNotes() {
        let s = NotesCapture.summary(forFolderNotes: (0..<5).map { NotesNoteInfo(id: "\($0)", title: "n\($0)") })
        XCTAssertEqual(s.openCount, 5)
        XCTAssertEqual(s.nextItems, ["n0", "n1", "n2"])
    }
}
