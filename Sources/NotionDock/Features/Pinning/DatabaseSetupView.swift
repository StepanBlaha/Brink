import SwiftUI
import NotionKit

/// Shown after picking a database/data source result: choose which property means "done"
/// (and, for a status property, which option counts as done), plus an optional date property.
struct DatabaseSetupView: View {
    let title: String
    let icon: Icon
    let loadSchema: () async throws -> DataSourceSchema
    let onSave: (DatabaseConfig) -> Void
    let onCancel: () -> Void

    @State private var schema: DataSourceSchema?
    @State private var isLoading = true
    @State private var errorMessage: String?

    @State private var donePropertyID: String?
    @State private var doneStatusValue: String?
    @State private var datePropertyID: String?

    private var doneCandidates: [PropertySchema] {
        (schema?.properties ?? []).filter { $0.type == "checkbox" || $0.type == "status" }
    }
    private var dateCandidates: [PropertySchema] {
        (schema?.properties ?? []).filter { $0.type == "date" }
    }
    private var doneProperty: PropertySchema? {
        schema?.properties.first { $0.id == donePropertyID }
    }
    private var dateProperty: PropertySchema? {
        schema?.properties.first { $0.id == datePropertyID }
    }
    private var canSave: Bool {
        guard let doneProperty else { return false }
        if doneProperty.type == "status" { return doneStatusValue != nil }
        return true
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            if isLoading {
                centered { ProgressView() }
            } else if let errorMessage {
                centered {
                    Text(errorMessage)
                        .font(Theme.Font.small)
                        .foregroundStyle(Theme.Color.danger)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }
            } else {
                form
            }
        }
        .frame(width: 380, height: 520)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .task { await load() }
    }

    private var header: some View {
        HStack {
            Text("Set up \u{201C}\(title.isEmpty ? "Untitled" : title)\u{201D}")
                .font(Theme.Font.title)
                .foregroundStyle(Theme.Color.text)
                .lineLimit(1)
            Spacer()
            Button(action: onCancel) {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(Theme.Color.secondaryText)
            }
            .buttonStyle(.notion)
            .focusEffectDisabled()
        }
        .padding(12)
    }

    private func centered<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack {
            Spacer()
            content()
            Spacer()
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Which property means done?")
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.secondaryText)
                Picker("", selection: $donePropertyID) {
                    Text("Choose…").tag(String?.none)
                    ForEach(doneCandidates) { property in
                        Text("\(property.name) (\(property.type))").tag(Optional(property.id))
                    }
                }
                .labelsHidden()
                .onChange(of: donePropertyID) { _, _ in doneStatusValue = nil }
            }

            if let doneProperty, doneProperty.type == "status" {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Which status option means done?")
                        .font(Theme.Font.small)
                        .foregroundStyle(Theme.Color.secondaryText)
                    Picker("", selection: $doneStatusValue) {
                        Text("Choose…").tag(String?.none)
                        ForEach(doneProperty.statusOptions ?? []) { option in
                            Text(option.name).tag(Optional(option.name))
                        }
                    }
                    .labelsHidden()
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Date property (optional)")
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.secondaryText)
                Picker("", selection: $datePropertyID) {
                    Text("None").tag(String?.none)
                    ForEach(dateCandidates) { property in
                        Text(property.name).tag(Optional(property.id))
                    }
                }
                .labelsHidden()
            }

            if doneCandidates.isEmpty {
                Text("This database has no checkbox or status property, so there's no way to mark rows done.")
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.secondaryText)
            }

            Spacer(minLength: 0)

            Button("Pin database") { save() }
                .buttonStyle(.notion)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .frame(maxWidth: .infinity)
                .background(Theme.Color.accent.opacity(canSave ? 1 : 0.4))
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.radius))
                .disabled(!canSave)
        }
        .padding(12)
    }

    private func load() async {
        do {
            let loaded = try await loadSchema()
            schema = loaded
            isLoading = false
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Failed to load database."
            isLoading = false
        }
    }

    private func save() {
        guard let doneProperty else { return }
        let kind: DoneKind = doneProperty.type == "status" ? .status : .checkbox
        let config = DatabaseConfig(
            doneProperty: doneProperty.name,
            doneKind: kind,
            doneValue: kind == .status ? doneStatusValue : nil,
            dateProperty: dateProperty?.name,
            showDone: false
        )
        onSave(config)
    }
}
