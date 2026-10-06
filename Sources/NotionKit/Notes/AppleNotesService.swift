import Foundation

/// `NotesProviding` over Apple Events: builds small JXA scripts, runs them through an
/// `AppleScriptRunning` and decodes their JSON. Arguments are passed as a JSON literal, never by
/// string-splicing, so note ids and HTML can't break out of the script.
public struct AppleNotesService: NotesProviding {
    private let runner: AppleScriptRunning

    public init(runner: AppleScriptRunning) {
        self.runner = runner
    }

    // MARK: - Scripts

    static let prelude = """
    const N = Application('Notes');
    function findFolder(id) {
      for (const acc of N.accounts()) for (const f of acc.folders()) if (f.id() === id) return f;
      throw new Error('NOT_FOUND');
    }
    const TRASH = ['Recently Deleted', 'Nedávno smazané', 'Nedávno odstránené', 'Zuletzt gelöscht', 'Supprimés récemment', 'Eliminados recientemente', 'Eliminati di recente', 'Ostatnio usunięte', 'Onlangs verwijderd', 'Apagados recentemente', 'Excluídos Recentemente'];
    function isTrash(f) { return TRASH.indexOf(f.name()) >= 0; }
    function inTrash(n) { try { return isTrash(n.container()); } catch (e) { return false; } }
    function findNote(id) {
      let n = null;
      try { n = N.notes.byId(id); n.id(); } catch (e) { n = null; }
      if (!n) { const r = N.notes.whose({id: id})(); if (r.length) n = r[0]; }
      if (!n || inTrash(n)) throw new Error('NOT_FOUND');
      return n;
    }
    function iso(d) { return d ? d.toISOString() : null; }
    function info(n) { return {id: n.id(), title: n.name(), modified: iso(n.modificationDate()), created: iso(n.creationDate())}; }
    function list(ns) {
      const ids = ns.id(), names = ns.name(), mods = ns.modificationDate(), crs = ns.creationDate();
      return ids.map((id, i) => ({id: id, title: names[i], modified: iso(mods[i]), created: iso(crs[i])}));
    }
    """

    /// Wraps `body` (which must assign `result`) with the prelude and the JSON arguments.
    static func script(args: [String: Any], body: String) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: args, options: [.sortedKeys])) ?? Data("{}".utf8)
        var json = String(decoding: data, as: UTF8.self)
        json = json.replacingOccurrences(of: "\u{2028}", with: "\\u2028").replacingOccurrences(of: "\u{2029}", with: "\\u2029")
        return "(function(){\n\(prelude)\nconst A = \(json);\nlet result;\n\(body)\nreturn JSON.stringify(result);\n})()"
    }

    // MARK: - NotesProviding

    public func folders() async throws -> [NotesFolder] {
        let out = try await call(args: [:], body: """
        result = [];
        for (const acc of N.accounts()) for (const f of acc.folders()) {
          if (isTrash(f)) continue;
          result.push({id: f.id(), name: f.name(), account: acc.name(), noteCount: f.notes.name().length});
        }
        """)
        return try decode([NotesFolder].self, out)
    }

    public func notes(inFolder folderId: String) async throws -> [NotesNoteInfo] {
        let out = try await call(args: ["id": folderId], body: "result = list(findFolder(A.id).notes);")
        return try decode([NotesNoteInfo].self, out).sorted(by: Self.newestFirst)
    }

    public func searchNotes(query: String, limit: Int) async throws -> [NotesNoteInfo] {
        let out = try await call(args: ["q": query], body: """
        const trashed = new Set();
        for (const acc of N.accounts()) for (const f of acc.folders()) if (isTrash(f)) f.notes.id().forEach(i => trashed.add(i));
        result = list(N.notes.whose({name: {_contains: A.q}})).filter(n => !trashed.has(n.id));
        """)
        // Newest first, then cut: the script returns every match.
        return Array(try decode([NotesNoteInfo].self, out).sorted(by: Self.newestFirst).prefix(limit))
    }

    public func note(id: String) async throws -> NotesNoteContent {
        struct Wire: Decodable { var id: String; var title: String; var modified: Date?; var created: Date?; var html: String; var plain: String }
        let out = try await call(args: ["id": id], body: """
        const n = findNote(A.id);
        result = Object.assign(info(n), {html: n.body(), plain: n.plaintext()});
        """)
        let wire = try decode(Wire.self, out)
        return NotesNoteContent(info: NotesNoteInfo(id: wire.id, title: wire.title, modified: wire.modified, created: wire.created), html: wire.html, plaintext: wire.plain)
    }

    public func createNote(inFolder folderId: String, html: String) async throws -> NotesNoteInfo {
        let out = try await call(args: ["id": folderId, "html": html], body: """
        const f = findFolder(A.id);
        const n = N.Note({body: A.html});
        f.notes.push(n);
        result = info(n);
        """)
        return try decode(NotesNoteInfo.self, out)
    }

    public func setBody(noteId: String, html: String) async throws {
        _ = try await call(args: ["id": noteId, "html": html], body: "findNote(A.id).body = A.html; result = true;")
    }

    public func show(noteId: String) async throws {
        _ = try await call(args: ["id": noteId], body: "findNote(A.id).show(); N.activate(); result = true;")
    }

    public func show(folderId: String) async throws {
        _ = try await call(args: ["id": folderId], body: "findFolder(A.id).show(); N.activate(); result = true;")
    }

    // MARK: - Plumbing

    static func newestFirst(_ a: NotesNoteInfo, _ b: NotesNoteInfo) -> Bool {
        (a.modified ?? a.created ?? .distantPast) > (b.modified ?? b.created ?? .distantPast)
    }

    private func call(args: [String: Any], body: String) async throws -> String {
        do {
            return try await runner.run(Self.script(args: args, body: body))
        } catch let error as NotesError {
            throw error
        } catch {
            let text = error.localizedDescription
            if text.contains("NOT_FOUND") { throw NotesError.notFound }
            throw NotesError.scriptFailed(text)
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, _ text: String) throws -> T {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let value = try decoder.singleValueContainer().decode(String.self)
            let plain = ISO8601DateFormatter()
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractional.date(from: value) ?? plain.date(from: value) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "bad date \(value)"))
        }
        do {
            return try decoder.decode(type, from: Data(text.utf8))
        } catch {
            throw NotesError.scriptFailed("unexpected reply")
        }
    }
}
