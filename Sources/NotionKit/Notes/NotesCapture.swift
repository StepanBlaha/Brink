import Foundation

/// Maps quick-capture / Send-to-Brink input plus an Apple Notes pin to what to do in Notes.
public enum NotesCapture {
    public enum Plan: Equatable, Sendable {
        /// New note in a folder, titled by its first line. `html` is the full body.
        case createNote(folderId: String, title: String, html: String)
        /// Append paragraphs to an existing (pinned) note.
        case appendToNote(noteId: String, blocks: [NoteBlock])
    }

    public static let maxTitleLength = 120

    /// `nil` when the pin isn't an Apple Notes pin or there is nothing to save.
    public static func plan(text: String, url: String? = nil, pin: Pin) -> Plan? {
        guard pin.source == .appleNotes else { return nil }
        var lines = text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
        while lines.first?.isEmpty == true { lines.removeFirst() }
        while lines.last?.isEmpty == true { lines.removeLast() }
        let trimmedURL = url?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let link = trimmedURL.isEmpty ? nil : URL(string: trimmedURL)
        if let link, !text.contains(link.absoluteString) {
            lines.append(link.absoluteString)
        }
        guard !lines.isEmpty else { return nil }

        func block(_ line: String) -> NoteBlock {
            guard !line.isEmpty else { return NoteBlock() }
            let isLink = link.map { line == $0.absoluteString } ?? false
            return NoteBlock(spans: [RichTextSpan(text: line, link: isLink ? link : nil)])
        }

        switch pin.kind {
        case .page:
            return .appendToNote(noteId: pin.notionId, blocks: lines.map(block))
        case .dataSource:
            let title = title(from: lines[0])
            var blocks = [NoteBlock(kind: .heading1, text: title)]
            // The first line is the title; it only repeats in the body when it was truncated.
            if title != lines[0] { blocks.append(block(lines[0])) }
            blocks += lines.dropFirst().map(block)
            return .createNote(folderId: pin.notionId, title: title, html: NotesHTML.render(blocks))
        }
    }

    /// First line, trimmed to a sensible title length.
    public static func title(from firstLine: String) -> String {
        let line = firstLine.trimmingCharacters(in: .whitespacesAndNewlines)
        guard line.count > maxTitleLength else { return line }
        return String(line.prefix(maxTitleLength)).trimmingCharacters(in: .whitespaces) + "…"
    }

    /// Runs a plan against Notes. Appending refuses notes the editor can't round-trip.
    /// Returns the toast text.
    @discardableResult
    public static func execute(_ plan: Plan, pinTitle: String, provider: NotesProviding) async throws -> String {
        switch plan {
        case .createNote(let folderId, _, let html):
            _ = try await provider.createNote(inFolder: folderId, html: html)
            return "Added to \(pinTitle) ✓"
        case .appendToNote(let noteId, let blocks):
            let note = try await provider.note(id: noteId)
            let parsed = NotesHTML.parse(note.html)
            guard parsed.isEditable else { throw NotesError.unsafeToEdit }
            try await provider.setBody(noteId: noteId, html: NotesHTML.render(parsed.blocks + blocks))
            return "Added to \(pinTitle) ✓"
        }
    }

    /// Badge/summary for a folder pin: its note count, newest titles as the peek lines.
    public static func summary(forFolderNotes notes: [NotesNoteInfo]) -> PinSummary {
        var summary = PinSummary.empty
        summary.openCount = notes.count
        summary.nextItems = notes.prefix(PinSummary.nextItemLimit).map { $0.title.isEmpty ? "Untitled" : $0.title }
        return summary
    }
}
