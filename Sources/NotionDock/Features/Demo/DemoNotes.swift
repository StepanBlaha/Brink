import Foundation
import NotionKit

/// Demo mode's fake Apple Notes: in memory, entirely fictional, never talks to the real app.
actor DemoNotesProvider: NotesProviding {
    static let folderIdeas = "demo-notes-folder-ideas"
    static let folderTrips = "demo-notes-folder-trips"
    static let noteShopping = "demo-notes-note-shopping"
    static let noteAttachments = "demo-notes-note-photos"

    private struct Entry { var info: NotesNoteInfo; var html: String; var folder: String }

    private var entries: [String: Entry] = [:]
    private var counter = 0

    init() {
        let now = Date()
        var seed: [String: Entry] = [:]
        func add(_ id: String, _ title: String, folder: String, minutesAgo: Double, html: String) {
            seed[id] = Entry(info: NotesNoteInfo(id: id, title: title, modified: now.addingTimeInterval(-minutesAgo * 60), created: now.addingTimeInterval(-minutesAgo * 90)), html: html, folder: folder)
        }
        add(Self.noteShopping, "Weekend plan", folder: Self.folderIdeas, minutesAgo: 12, html:
            "<div><h1>Weekend plan</h1></div><div>Saturday is for the <b>farmers market</b> and a long walk.</div><div><br></div>"
            + "<div><h2>Cook</h2></div><ul><li>Shakshuka</li><li>Sourdough<ul><li>Start the starter Friday</li></ul></li></ul>"
            + "<ol><li>Buy eggs</li><li>Buy peppers</li></ol><div>Recipe: <a href=\"https://example.com/shakshuka\">shakshuka</a></div>")
        add("demo-notes-note-app", "App idea: tide clock", folder: Self.folderIdeas, minutesAgo: 95, html:
            "<div><h1>App idea: tide clock</h1></div><div>A watch face that shows the <i>tide</i>, not the time.</div>")
        add("demo-notes-note-gift", "Gift ideas", folder: Self.folderIdeas, minutesAgo: 60 * 30, html: "<div><h1>Gift ideas</h1></div><ul><li>Ceramic mug</li><li>Field notebook</li></ul>")
        add(Self.noteAttachments, "Lisbon photos", folder: Self.folderTrips, minutesAgo: 60 * 50, html:
            "<div><h1>Lisbon photos</h1></div><div>Best views from the tram.</div><div><img src=\"data:image/png;base64,AAAA\"></div>")
        add("demo-notes-note-pack", "Packing list", folder: Self.folderTrips, minutesAgo: 60 * 72, html: "<div><h1>Packing list</h1></div><div>Passport, charger, sunscreen.</div>")
        entries = seed
    }

    func folders() async throws -> [NotesFolder] {
        func count(_ id: String) -> Int { entries.values.filter { $0.folder == id }.count }
        return [NotesFolder(id: Self.folderIdeas, name: "Ideas", account: "iCloud", noteCount: count(Self.folderIdeas)),
                NotesFolder(id: Self.folderTrips, name: "Trips", account: "iCloud", noteCount: count(Self.folderTrips))]
    }

    func notes(inFolder folderId: String) async throws -> [NotesNoteInfo] {
        return entries.values.filter { $0.folder == folderId }.map(\.info).sorted { ($0.modified ?? .distantPast) > ($1.modified ?? .distantPast) }
    }

    func searchNotes(query: String, limit: Int) async throws -> [NotesNoteInfo] {
        let q = query.lowercased()
        return Array(entries.values.map(\.info).filter { $0.title.lowercased().contains(q) }.prefix(limit))
    }

    func note(id: String) async throws -> NotesNoteContent {
        guard let entry = entries[id] else { throw NotesError.notFound }
        return NotesNoteContent(info: entry.info, html: entry.html, plaintext: NotesHTML.plainText(entry.html))
    }

    func createNote(inFolder folderId: String, html: String) async throws -> NotesNoteInfo {
        counter += 1
        let id = "demo-notes-new-\(counter)"
        let info = NotesNoteInfo(id: id, title: Self.title(html), modified: Date(), created: Date())
        entries[id] = Entry(info: info, html: html, folder: folderId)
        return info
    }

    func setBody(noteId: String, html: String) async throws {
        guard var entry = entries[noteId] else { throw NotesError.notFound }
        entry.html = html
        entry.info.title = Self.title(html)
        entry.info.modified = Date()
        entries[noteId] = entry
    }

    func show(noteId: String) async throws {}
    func show(folderId: String) async throws {}

    private nonisolated static func title(_ html: String) -> String {
        NotesHTML.parse(html).blocks.first?.plainText ?? ""
    }
}

/// Demo pins and the "notes" demo script (`{"script": "notes"}`): Apple Notes folder, note and a
/// read-only note, all backed by `DemoNotesProvider`. Never touches the real Notes app.
extension DemoContent {
    static let notesFolderPinID = "demo-notes-pin-folder"
    static let notesNotePinID = "demo-notes-pin-note"
    static let notesReadOnlyPinID = "demo-notes-pin-readonly"

    static var notesPins: [Pin] {
        [
            Pin(id: notesFolderPinID, notionId: DemoNotesProvider.folderIdeas, kind: .dataSource, title: "Ideas", icon: .emoji("\u{1F5C2}\u{FE0F}"), order: 0, source: .appleNotes),
            Pin(id: notesNotePinID, notionId: DemoNotesProvider.noteShopping, kind: .page, title: "Weekend plan", icon: .emoji("\u{1F4DD}"), order: 1, source: .appleNotes),
            Pin(id: notesReadOnlyPinID, notionId: DemoNotesProvider.noteAttachments, kind: .page, title: "Lisbon photos", icon: .emoji("\u{1F4F7}"), order: 2, source: .appleNotes),
        ]
    }
}

extension DemoDirector {
    func runNotes() async {
        await DemoUI.sleep(1.5)
        for (pin, shot) in [(DemoContent.notesFolderPinID, "notes-folder"), (DemoContent.notesNotePinID, "notes-note"), (DemoContent.notesReadOnlyPinID, "notes-readonly")] {
            dock.demoOpen(pinID: pin)
            await DemoUI.sleep(3.0)
            DemoMode.mark(shot)
            await DemoUI.sleep(2.0)
            dock.demoSetPhase(.resting)
            await DemoUI.sleep(1.0)
        }
    }
}
