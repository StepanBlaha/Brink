import SwiftUI
import NotionKit

/// Settings → Connection → Apple Notes: Connect (triggers the macOS Automation prompt) + status.
struct NotesConnectionSection: View {
    let appModel: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Apple Notes")
                .font(Theme.Font.title)
                .foregroundStyle(Theme.Color.text)

            HStack(spacing: 10) {
                if appModel.notesAccess != .notAvailable {
                    Button(buttonTitle) { Task { await appModel.connectNotes() } }
                        .buttonStyle(.notion)
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Theme.Color.accent.opacity(appModel.notesAccess == .allowed ? 0.45 : 1), in: RoundedRectangle(cornerRadius: Theme.Metrics.radius))
                        .foregroundStyle(.white)
                        .disabled(appModel.isRequestingNotesAccess)
                }
                statusLabel
            }

            if appModel.notesAccess == .denied {
                HStack(spacing: 6) {
                    Text("Open System Settings → Privacy & Security → Automation and turn on Notes under Brink.")
                        .font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Open") { NotesSettingsLink.openAutomation() }
                        .buttonStyle(.link).font(Theme.Font.small)
                }
            }

            Text("Pin Apple Notes folders and notes, and send quick captures there. Brink talks to the Notes app on this Mac only; iPhone sync is Notes' own iCloud sync.")
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .task { await appModel.refreshNotesAccess() }
    }

    private var buttonTitle: String {
        if appModel.isRequestingNotesAccess { return "Waiting for macOS…" }
        return appModel.notesAccess == .allowed ? "Check again" : "Connect Apple Notes"
    }

    @ViewBuilder
    private var statusLabel: some View {
        switch appModel.notesAccess {
        case .allowed:
            Label("Allowed", systemImage: "checkmark.circle.fill").font(Theme.Font.small).foregroundStyle(Theme.Color.success)
        case .denied:
            Label("Denied", systemImage: "xmark.octagon.fill").font(Theme.Font.small).foregroundStyle(Theme.Color.danger)
        case .notAvailable:
            Label("Notes isn't available on this Mac", systemImage: "exclamationmark.triangle").font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
        case .unknown:
            Text("Not connected yet").font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
        }
    }
}
