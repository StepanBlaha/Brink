import SwiftUI
import NotionKit

/// Lists Apple Notes folders and notes (with search) so a folder or a single note can be pinned.
struct NotesPinPickerView: View {
    let appModel: AppModel
    let onPick: (NotesPick) -> Void

    @State private var query = ""
    @State private var folders: [NotesFolder] = []
    @State private var browsing: NotesFolder?
    @State private var notes: [NotesNoteInfo] = []
    @State private var results: [NotesNoteInfo] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var searchTask: Task<Void, Never>?
    @FocusState private var searchFocused: Bool

    private var pinnedIDs: Set<String> {
        Set(appModel.pinStore.pins.filter { $0.source == .appleNotes }.map(\.notionId))
    }

    private var trimmedQuery: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(spacing: 0) {
            if appModel.notesAccess == .allowed || DemoMode.isActive {
                picker
            } else {
                accessGate
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task { await appModel.refreshNotesAccess() }
    }

    // MARK: Access gate

    private var accessGate: some View {
        VStack(spacing: 10) {
            Spacer()
            Text(gateText)
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.secondaryText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            if appModel.notesAccess == .denied {
                Button("Open Automation settings") { NotesSettingsLink.openAutomation() }
                    .buttonStyle(.link).font(Theme.Font.small)
            } else if appModel.notesAccess != .notAvailable {
                Button(appModel.isRequestingNotesAccess ? "Waiting for macOS…" : "Connect Apple Notes") {
                    Task { await appModel.connectNotes(); if appModel.notesAccess == .allowed { await loadFolders() } }
                }
                .buttonStyle(.notion)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Theme.Color.accent, in: RoundedRectangle(cornerRadius: Theme.Metrics.radius))
                .foregroundStyle(.white)
                .disabled(appModel.isRequestingNotesAccess)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var gateText: String {
        switch appModel.notesAccess {
        case .denied: return "Brink isn't allowed to control Notes. Turn it on under System Settings → Privacy & Security → Automation."
        case .notAvailable: return "The Notes app isn't available on this Mac."
        default: return "Brink needs your permission to read and write your notes. macOS will ask once."
        }
    }

    // MARK: Picker

    private var picker: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                if let browsing, trimmedQuery.isEmpty {
                    AddFlowIconButton(systemName: "chevron.left", help: "Folders") { self.browsing = nil }
                    Text(browsing.name).font(Theme.Font.small.weight(.medium)).foregroundStyle(Theme.Color.text).lineLimit(1)
                    Spacer()
                    Button("Pin folder") { onPick(.folder(browsing)) }
                        .buttonStyle(.link).font(Theme.Font.small)
                } else {
                    Image(systemName: "magnifyingglass").font(.system(size: 12)).foregroundStyle(Theme.Color.secondaryText)
                    TextField("Search Notes…", text: $query)
                        .textFieldStyle(.plain)
                        .font(Theme.Font.body)
                        .focused($searchFocused)
                }
            }
            .padding(.horizontal, 8)
            .frame(height: 30)
            .background(RoundedRectangle(cornerRadius: Theme.Metrics.radius + 2).fill(Color.white.opacity(browsing == nil || !trimmedQuery.isEmpty ? 0.08 : 0)))
            .padding(.horizontal, Theme.Metrics.hPadding)
            .padding(.vertical, 8)
            content.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .task(id: appModel.notesAccess) {
            guard appModel.notesAccess == .allowed || DemoMode.isActive else { return }
            searchFocused = true
            await loadFolders()
        }
        .onChange(of: query) { _, _ in scheduleSearch() }
    }

    @ViewBuilder
    private var content: some View {
        if let errorMessage {
            Text(errorMessage)
                .font(Theme.Font.small).foregroundStyle(Theme.Color.danger)
                .multilineTextAlignment(.center).padding(.horizontal, 24)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if isLoading && folders.isEmpty {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVStack(spacing: 0) {
                    if !trimmedQuery.isEmpty {
                        ForEach(matchingFolders) { folderRow($0) }
                        ForEach(results) { noteRow($0) }
                    } else if browsing != nil {
                        ForEach(notes) { noteRow($0) }
                    } else {
                        ForEach(folders) { folderRow($0) }
                    }
                }
                .padding(.horizontal, 6).padding(.bottom, 6)
            }
            .scrollIndicators(.hidden)
        }
    }

    private var matchingFolders: [NotesFolder] {
        folders.filter { $0.name.localizedCaseInsensitiveContains(trimmedQuery) }
    }

    private func folderRow(_ folder: NotesFolder) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "folder").font(.system(size: 12)).foregroundStyle(Theme.Color.secondaryText)
            Text(folder.name).font(Theme.Font.body).foregroundStyle(Theme.Color.text).lineLimit(1)
            Text("\(folder.noteCount)").font(Theme.Font.caption).foregroundStyle(Theme.Color.tertiaryText)
            // Every account has a "Notes" folder; say which one this is.
            if folders.filter({ $0.name == folder.name }).count > 1 {
                Text(folder.account).font(Theme.Font.caption).foregroundStyle(Theme.Color.tertiaryText).lineLimit(1)
            }
            Spacer(minLength: 8)
            if pinnedIDs.contains(folder.id) {
                Text("Pinned").font(Theme.Font.caption).foregroundStyle(Theme.Color.tertiaryText)
            } else {
                Button("Pin") { onPick(.folder(folder)) }.buttonStyle(.link).font(Theme.Font.small)
            }
            Image(systemName: "chevron.right").font(.system(size: 10)).foregroundStyle(Theme.Color.tertiaryText)
        }
        .padding(.horizontal, 8)
        .frame(height: Theme.Metrics.rowHeight + 2)
        .contentShape(Rectangle())
        .onTapGesture { openFolder(folder) }
        .notionHover()
    }

    private func noteRow(_ note: NotesNoteInfo) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "note.text").font(.system(size: 12)).foregroundStyle(Theme.Color.secondaryText)
            Text(note.title.isEmpty ? "New Note" : note.title).font(Theme.Font.body).foregroundStyle(Theme.Color.text).lineLimit(1)
            Spacer(minLength: 8)
            if pinnedIDs.contains(note.id) {
                Text("Pinned").font(Theme.Font.caption).foregroundStyle(Theme.Color.tertiaryText)
            } else if let date = note.modified ?? note.created {
                Text(NotesDateLabel.text(date)).font(Theme.Font.caption).foregroundStyle(Theme.Color.tertiaryText)
            }
        }
        .padding(.horizontal, 8)
        .frame(height: Theme.Metrics.rowHeight + 2)
        .contentShape(Rectangle())
        .onTapGesture { onPick(.note(note)) }
        .notionHover()
    }

    // MARK: Loading

    private func loadFolders() async {
        isLoading = true
        defer { isLoading = false }
        do {
            folders = try await appModel.notes.folders()
            errorMessage = nil
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            await appModel.refreshNotesAccess()
        }
    }

    private func openFolder(_ folder: NotesFolder) {
        query = ""
        browsing = folder
        notes = []
        Task {
            do { notes = try await appModel.notes.notes(inFolder: folder.id) }
            catch { errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription }
        }
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        let q = trimmedQuery
        guard !q.isEmpty else { results = []; return }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            if let found = try? await appModel.notes.searchNotes(query: q, limit: 40), !Task.isCancelled { results = found }
        }
    }
}
