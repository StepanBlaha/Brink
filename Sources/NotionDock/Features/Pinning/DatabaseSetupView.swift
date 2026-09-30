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
    /// When editing an existing pin's view: prefills every field from this config.
    var initialConfig: DatabaseConfig? = nil
    var saveLabel: String = "Pin database"
    /// Set when reached from the search step: shows a back button.
    var onBack: (() -> Void)? = nil

    @State private var schema: DataSourceSchema?
    @State private var isLoading = true
    @State private var errorMessage: String?

    @State private var donePropertyID: String?
    @State private var doneStatusValue: String?
    @State private var datePropertyID: String?

    @State private var viewOptionsExpanded = false
    @State private var viewName = ""
    @State private var filters: [ViewFilter] = []
    @State private var sorts: [ViewSort] = []
    @State private var showDone = false

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
            AddFlowHeader(title: title.isEmpty ? "Untitled" : title, onBack: onBack, onClose: onCancel)
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
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .task { await load() }
    }

    private func centered<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack {
            Spacer()
            content()
            Spacer()
        }
    }

    private var form: some View {
        ScrollView {
            formContent
        }
        .scrollIndicators(.hidden)
    }

    private var viewOptions: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(Theme.Motion.list) { viewOptionsExpanded.toggle() }
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .semibold))
                        .rotationEffect(.degrees(viewOptionsExpanded ? 90 : 0))
                    Text("View options")
                        .font(Theme.Font.small)
                    Spacer(minLength: 0)
                }
                .foregroundStyle(Theme.Color.secondaryText)
                .contentShape(Rectangle())
            }
            .buttonStyle(.notion)
            if viewOptionsExpanded, let schema {
                ViewBuilderSection(schema: schema, viewName: $viewName, filters: $filters, sorts: $sorts, showDone: $showDone)
                    .transition(Theme.Motion.rowTransition)
            }
        }
    }

    private var formContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
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
                .controlSize(.small)
                .frame(maxWidth: .infinity, alignment: .leading)
                .onChange(of: donePropertyID) { _, newID in
                    let initial = schema?.properties.first { $0.name == initialConfig?.doneProperty }
                    doneStatusValue = (newID != nil && newID == initial?.id) ? initialConfig?.doneValue : nil
                }
            }

            if let doneProperty, doneProperty.type == "status" {
                VStack(alignment: .leading, spacing: 4) {
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
                .controlSize(.small)
                .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
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
                .controlSize(.small)
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            if doneCandidates.isEmpty {
                Text("This database has no checkbox or status property, so there's no way to mark rows done.")
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.secondaryText)
            }

            viewOptions

            Button { save() } label: {
                Text(saveLabel)
                    .font(Theme.Font.small.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 28)
            }
                .buttonStyle(.notion)
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
            prefill(from: loaded)
            isLoading = false
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Failed to load database."
            isLoading = false
        }
    }

    private func prefill(from schema: DataSourceSchema) {
        guard let c = initialConfig else { return }
        donePropertyID = schema.properties.first { $0.name == c.doneProperty && ($0.type == "checkbox" || $0.type == "status") }?.id
        doneStatusValue = c.doneValue
        datePropertyID = c.dateProperty.flatMap { name in schema.properties.first { $0.name == name && $0.type == "date" }?.id }
        viewName = c.viewName ?? ""
        filters = c.filters ?? []
        sorts = c.sorts ?? []
        showDone = c.showDone
        viewOptionsExpanded = false
    }

    private func save() {
        guard let doneProperty else { return }
        let kind: DoneKind = doneProperty.type == "status" ? .status : .checkbox
        let config = DatabaseConfig(
            doneProperty: doneProperty.name,
            doneKind: kind,
            doneValue: kind == .status ? doneStatusValue : nil,
            dateProperty: dateProperty?.name,
            showDone: showDone,
            filters: filters.isEmpty ? nil : filters,
            sorts: sorts.isEmpty ? nil : sorts,
            viewName: viewName.trimmingCharacters(in: .whitespaces).isEmpty ? nil : viewName.trimmingCharacters(in: .whitespaces)
        )
        onSave(config)
    }
}
