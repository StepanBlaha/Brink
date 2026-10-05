import SwiftUI
import AppKit
import NotionKit

/// Panel content for an Apple Notes pin: a folder (list of notes) or a single note.
struct NotesPinView: View {
    let pin: Pin
    let folder: NotesFolderModel?
    let note: NotesNoteModel?

    var body: some View {
        if let folder {
            NotesFolderView(model: folder)
        } else if let note {
            NotesNoteView(model: note)
        }
    }
}

// MARK: - Folder

struct NotesFolderView: View {
    let model: NotesFolderModel

    var body: some View {
        Group {
            if let open = model.openNote {
                NotesNoteView(model: open, onBack: { model.closeNote() })
            } else {
                list
            }
        }
        .task {
            await model.load()
            model.startPolling()
        }
        .onDisappear { model.stopPolling() }
    }

    private var list: some View {
        VStack(spacing: 0) {
            HStack {
                Button { Task { await model.addNote() } } label: {
                    Label("Add a note", systemImage: "plus")
                        .font(Theme.Font.small.weight(.medium))
                        .foregroundStyle(Theme.Color.text)
                        .padding(.horizontal, 8).padding(.vertical, 5)
                }
                .buttonStyle(.notion)
                .notionHover()
                .disabled(model.isCreating)
                Spacer()
                Button("Open in Notes") { model.openFolderInNotes() }
                    .buttonStyle(.link)
                    .font(Theme.Font.small)
            }
            .padding(.horizontal, Theme.Metrics.hPadding - 4)
            .padding(.vertical, 6)
            Rectangle().fill(Theme.Color.divider).frame(height: 1)
            content
        }
    }

    @ViewBuilder
    private var content: some View {
        if let message = model.errorMessage, model.notes.isEmpty {
            NotesProblemView(message: message)
        } else if !model.hasLoaded {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if model.notes.isEmpty {
            Text("No notes in this folder yet.")
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.secondaryText)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(model.notes) { note in
                        Button { model.open(note.id) } label: {
                            HStack(spacing: 8) {
                                Text(note.title.isEmpty ? "New Note" : note.title)
                                    .font(Theme.Font.body)
                                    .foregroundStyle(Theme.Color.text)
                                    .lineLimit(1)
                                Spacer(minLength: 8)
                                if let date = note.modified ?? note.created {
                                    Text(NotesDateLabel.text(date))
                                        .font(Theme.Font.caption)
                                        .foregroundStyle(Theme.Color.tertiaryText)
                                }
                            }
                            .padding(.horizontal, 8)
                            .frame(height: Theme.Metrics.rowHeight)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .notionHover()
                    }
                }
                .padding(.horizontal, 4)
                .padding(.vertical, 4)
            }
            .scrollIndicators(.hidden)
        }
    }
}

enum NotesDateLabel {
    static func text(_ date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        if calendar.isDate(date, inSameDayAs: now) { return date.formatted(date: .omitted, time: .shortened) }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        if let days = calendar.dateComponents([.day], from: date, to: now).day, days < 7 {
            return date.formatted(.dateTime.weekday(.abbreviated))
        }
        return date.formatted(.dateTime.day().month(.abbreviated))
    }
}

// MARK: - Note

struct NotesNoteView: View {
    let model: NotesNoteModel
    var onBack: (() -> Void)?

    var body: some View {
        VStack(spacing: 0) {
            if let onBack {
                HStack {
                    Button(action: onBack) {
                        Label("Notes", systemImage: "chevron.left")
                            .font(Theme.Font.small.weight(.medium))
                            .foregroundStyle(Theme.Color.secondaryText)
                    }
                    .buttonStyle(.plain)
                    Spacer()
                }
                .padding(.horizontal, Theme.Metrics.hPadding)
                .padding(.vertical, 6)
                Rectangle().fill(Theme.Color.divider).frame(height: 1)
            }
            if let message = model.errorMessage, !model.hasLoaded {
                NotesProblemView(message: message)
            } else {
                if let readOnly = model.readOnlyMessage { readOnlyBanner(readOnly) }
                if model.find.isVisible { FindBar(controller: model.find) }
                ZStack(alignment: .topLeading) {
                    MarkdownEditorView(document: model.document, find: model.find, isEditable: model.isEditable, onOpenToken: { _ in })
                    if !model.hasLoaded { ProgressView().padding(.top, 20).frame(maxWidth: .infinity) }
                }
                footer
            }
        }
        .task {
            await model.load()
            model.startPolling()
        }
        .onDisappear { model.stopPolling() }
    }

    private func readOnlyBanner(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(message)
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            Button("Open in Notes") { model.openInNotes() }
                .buttonStyle(.link)
                .font(Theme.Font.small)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Theme.Metrics.hPadding)
        .padding(.vertical, 8)
        .background(Theme.Color.hover.opacity(0.6))
    }

    private var footer: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Theme.Color.divider).frame(height: 1)
            HStack(spacing: 8) {
                if model.hasConflict {
                    Text("Changed in Notes while you were editing.")
                        .font(Theme.Font.caption).foregroundStyle(Theme.Color.danger)
                    Button("Keep mine") { model.keepMine() }.buttonStyle(.link).font(Theme.Font.caption)
                    Button("Use Notes' version") { model.useNotesVersion() }.buttonStyle(.link).font(Theme.Font.caption)
                } else if model.readOnlyMessage != nil {
                    Text("Read-only").font(Theme.Font.caption).foregroundStyle(Theme.Color.tertiaryText)
                    if model.hasChecklist {
                        Text("Checklists can't be edited from outside Notes.")
                            .font(Theme.Font.caption).foregroundStyle(Theme.Color.tertiaryText)
                    }
                } else {
                    Text(model.status.label)
                        .font(Theme.Font.caption)
                        .foregroundStyle(statusColor)
                }
                Spacer()
                if model.readOnlyMessage == nil {
                    Button("Open in Notes") { model.openInNotes() }
                        .buttonStyle(.link)
                        .font(Theme.Font.caption)
                }
            }
            .padding(.horizontal, Theme.Metrics.hPadding)
            .padding(.vertical, 6)
        }
        .background(Theme.Color.background)
    }

    private var statusColor: Color {
        if case .error = model.status { return Theme.Color.danger }
        return Theme.Color.secondaryText
    }
}

// MARK: - Problems

/// Shown instead of content when Notes can't be reached (permission, note gone, …).
struct NotesProblemView: View {
    let message: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle").foregroundStyle(Theme.Color.secondaryText)
            Text(message)
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.secondaryText)
                .multilineTextAlignment(.center)
            Button("Open Automation settings") { NotesSettingsLink.openAutomation() }
                .buttonStyle(.link)
                .font(Theme.Font.small)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
    }
}

enum NotesSettingsLink {
    /// System Settings → Privacy & Security → Automation.
    static func openAutomation() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation") {
            NSWorkspace.shared.open(url)
        }
    }
}
