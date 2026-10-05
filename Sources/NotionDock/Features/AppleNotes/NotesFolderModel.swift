import Foundation
import Observation
import NotionKit

/// A pinned Apple Notes folder: its notes (newest first), "Add a note", and the open note.
@MainActor
@Observable
final class NotesFolderModel {
    let folderId: String
    private(set) var notes: [NotesNoteInfo] = []
    private(set) var hasLoaded = false
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var isCreating = false
    /// The note being edited inside this folder, if any.
    private(set) var openNote: NotesNoteModel?

    @ObservationIgnored private let provider: NotesProviding
    @ObservationIgnored private var pollTask: Task<Void, Never>?
    @ObservationIgnored private var noteModels: [String: NotesNoteModel] = [:]

    init(folderId: String, provider: NotesProviding) {
        self.folderId = folderId
        self.provider = provider
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            notes = try await provider.notes(inFolder: folderId)
            errorMessage = nil
            hasLoaded = true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(NotesNoteModel.pollInterval * 1_000_000_000))
                guard !Task.isCancelled else { return }
                await self?.load()
            }
        }
        openNote?.startPolling()
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
        openNote?.stopPolling()
    }

    func open(_ id: String) {
        let model = noteModels[id] ?? NotesNoteModel(noteId: id, provider: provider)
        noteModels[id] = model
        openNote = model
        model.startPolling()
        Task { await model.load() }
    }

    func closeNote() {
        openNote?.stopPolling()
        openNote = nil
        Task { await load() }
    }

    /// Creates an empty note in this folder and opens it.
    func addNote() async {
        guard !isCreating else { return }
        isCreating = true
        defer { isCreating = false }
        do {
            let info = try await provider.createNote(inFolder: folderId, html: NotesHTML.render([NoteBlock()]))
            notes.insert(info, at: 0)
            open(info.id)
            NotificationCenter.default.post(name: .pinContentDidChange, object: nil)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func openFolderInNotes() {
        Task { try? await provider.show(folderId: folderId) }
    }
}
