import Foundation

/// What Brink may do with Apple Notes right now (Settings → Connection).
public enum NotesAccessStatus: Equatable, Sendable {
    case unknown
    case allowed
    /// The user said no to "Brink wants to control Notes".
    case denied
    /// The Notes app isn't installed / can't be found.
    case notAvailable
}

public struct NotesFolder: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var account: String
    public var noteCount: Int

    public init(id: String, name: String, account: String, noteCount: Int) {
        self.id = id
        self.name = name
        self.account = account
        self.noteCount = noteCount
    }
}

/// A note as listed (no body).
public struct NotesNoteInfo: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var modified: Date?
    public var created: Date?

    public init(id: String, title: String, modified: Date? = nil, created: Date? = nil) {
        self.id = id
        self.title = title
        self.modified = modified
        self.created = created
    }
}

/// A note with its HTML body.
public struct NotesNoteContent: Equatable, Sendable {
    public var info: NotesNoteInfo
    public var html: String
    public var plaintext: String

    public init(info: NotesNoteInfo, html: String, plaintext: String) {
        self.info = info
        self.html = html
        self.plaintext = plaintext
    }
}

public enum NotesError: Error, Equatable, Sendable, LocalizedError {
    /// macOS Automation says no (error -1743).
    case permissionDenied
    case notFound
    /// The note has content the editor can't round-trip; Brink refuses to rewrite it.
    case unsafeToEdit
    case scriptFailed(String)

    public var errorDescription: String? {
        switch self {
        case .permissionDenied: return "Brink isn't allowed to control Notes. Open System Settings → Privacy & Security → Automation."
        case .notFound: return "That note no longer exists in Notes."
        case .unsafeToEdit: return "This note has content Brink can't edit safely. Open it in Notes."
        case .scriptFailed(let message): return "Notes said: \(message)"
        }
    }
}

/// Runs one script against the Notes app (JavaScript for Automation) and returns its string
/// result. The app implements this with OSAKit off the main thread; tests use a fake.
public protocol AppleScriptRunning: Sendable {
    func run(_ source: String) async throws -> String
}

/// Everything Brink needs from Apple Notes. `AppleNotesService` is the real one;
/// `DemoNotesProvider` (demo mode) and test fakes stand in elsewhere.
public protocol NotesProviding: Sendable {
    func folders() async throws -> [NotesFolder]
    func notes(inFolder folderId: String) async throws -> [NotesNoteInfo]
    func searchNotes(query: String, limit: Int) async throws -> [NotesNoteInfo]
    func note(id: String) async throws -> NotesNoteContent
    func createNote(inFolder folderId: String, html: String) async throws -> NotesNoteInfo
    func setBody(noteId: String, html: String) async throws
    /// `show` the note (or folder) in the Notes app.
    func show(noteId: String) async throws
    func show(folderId: String) async throws
}
