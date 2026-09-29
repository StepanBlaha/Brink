import SwiftUI
import NotionKit

enum SettingsSection: String, CaseIterable, Identifiable {
    case connection = "Connection"
    case appearance = "Appearance"
    case general = "General"
    case groups = "Groups"
    case shortcuts = "Shortcuts"
    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .connection: return "link"
        case .appearance: return "paintpalette"
        case .general: return "gearshape"
        case .groups: return "folder"
        case .shortcuts: return "keyboard"
        }
    }
}

/// Shared, out-of-body navigation state so `SettingsWindowController.show(section:)` can jump
/// to a section (e.g. "Groups", from the strip's "Manage…") even if the window is already open.
@Observable
final class SettingsNavigation {
    var section: SettingsSection = .connection
}

struct SettingsView: View {
    let appModel: AppModel
    var navigation = SettingsNavigation()

    private var section: Binding<SettingsSection> {
        Binding(get: { navigation.section }, set: { navigation.section = $0 })
    }

    var body: some View {
        NavigationSplitView {
            List(SettingsSection.allCases, selection: section) { item in
                Label(item.rawValue, systemImage: item.symbol)
                    .tag(item)
            }
            .navigationSplitViewColumnWidth(min: 140, ideal: 150)
        } detail: {
            Group {
                switch navigation.section {
                case .connection: ConnectionSettingsView(appModel: appModel)
                case .appearance: AppearanceSettingsView()
                case .general: GeneralSettingsSection()
                case .groups: GroupsSettingsView(pinStore: appModel.pinStore)
                case .shortcuts: ShortcutsSettingsView()
                }
            }
            .frame(minWidth: 360, minHeight: 420, alignment: .top)
            .background(Theme.Color.background)
        }
        .frame(width: 560, height: 540)
        .background(Theme.Color.background)
    }
}

// MARK: - Connection

private struct ConnectionSettingsView: View {
    let appModel: AppModel

    @State private var tokenInput = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Connect to Notion")
                .font(Theme.Font.title)
                .foregroundStyle(Theme.Color.text)

            VStack(alignment: .leading, spacing: 6) {
                Text("Internal integration token")
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.secondaryText)
                SecureField("secret_…", text: $tokenInput)
                    .textFieldStyle(.roundedBorder)
            }

            HStack(spacing: 8) {
                Button("Save") {
                    appModel.saveToken(tokenInput)
                    tokenInput = ""
                }
                .buttonStyle(.notion)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Theme.Color.accent.opacity(tokenInput.trimmingCharacters(in: .whitespaces).isEmpty ? 0.4 : 1))
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.radius))
                .disabled(tokenInput.trimmingCharacters(in: .whitespaces).isEmpty)

                Button("Test connection") {
                    Task { await appModel.testConnection() }
                }
                .buttonStyle(.notion)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Theme.Color.hover)
                .foregroundStyle(Theme.Color.text)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.radius))
                .disabled(!appModel.hasToken)

                Button("Remove token") {
                    appModel.removeToken()
                }
                .buttonStyle(.notion)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Theme.Color.hover)
                .foregroundStyle(Theme.Color.danger)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.radius))
                .disabled(!appModel.hasToken)
            }

            statusView

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text(appModel.hasToken ? "Token saved." : "No token yet. Paste one above.")
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.secondaryText)

                Link("Create an integration at notion.so/profile/integrations",
                     destination: URL(string: "https://www.notion.so/profile/integrations")!)
                    .font(Theme.Font.small)

                Text("Share each page with your integration in Notion: page ••• → Connections.")
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer()
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    @ViewBuilder
    private var statusView: some View {
        switch appModel.connectionStatus {
        case .idle:
            EmptyView()
        case .testing:
            HStack(spacing: 6) {
                ProgressView().controlSize(.small)
                Text("Testing…").font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
            }
        case .connected(let count):
            Text("Connected — the integration can see \(count) item\(count == 1 ? "" : "s").")
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.text)
        case .error(let message):
            Text(message)
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.danger)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Groups

private struct GroupsSettingsView: View {
    @Bindable var pinStore: PinStore

    @State private var newGroupName = ""
    @State private var newGroupEmoji = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Pin Groups")
                .font(Theme.Font.title)
                .foregroundStyle(Theme.Color.text)

            Text("Group pins together; the strip's switcher shows one group's pins at a time, or \u{201C}All pins\u{201D}. Deleting a group ungroups its pins instead of removing them.")
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.secondaryText)
                .fixedSize(horizontal: false, vertical: true)

            List {
                ForEach(Array(pinStore.groups.enumerated()), id: \.element.id) { index, group in
                    GroupRow(
                        group: group,
                        pinCount: pinStore.pins.filter { $0.groupId == group.id }.count,
                        onRename: { name, emoji in pinStore.renameGroup(id: group.id, name: name, emoji: emoji) },
                        onMoveUp: index > 0 ? { pinStore.moveGroup(fromOffsets: IndexSet(integer: index), toOffset: index - 1) } : nil,
                        onMoveDown: index < pinStore.groups.count - 1 ? { pinStore.moveGroup(fromOffsets: IndexSet(integer: index), toOffset: index + 2) } : nil,
                        onDelete: { pinStore.deleteGroup(id: group.id) }
                    )
                }
            }
            .listStyle(.inset)
            .frame(minHeight: 160, maxHeight: 220)
            .scrollContentBackground(.hidden)
            .background(Theme.Color.sidebar)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.radius))

            HStack(spacing: 8) {
                TextField("Emoji", text: $newGroupEmoji)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 50)
                TextField("New group name", text: $newGroupName)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit(addGroup)
                Button("Add") { addGroup() }
                    .buttonStyle(.notion)
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Theme.Color.accent.opacity(newGroupName.trimmingCharacters(in: .whitespaces).isEmpty ? 0.4 : 1))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.radius))
                    .disabled(newGroupName.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            Spacer()
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func addGroup() {
        let name = newGroupName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        let emoji = newGroupEmoji.trimmingCharacters(in: .whitespaces)
        pinStore.addGroup(name: name, emoji: emoji.isEmpty ? nil : emoji)
        newGroupName = ""
        newGroupEmoji = ""
    }
}

private struct GroupRow: View {
    let group: PinGroup
    let pinCount: Int
    let onRename: (String, String?) -> Void
    var onMoveUp: (() -> Void)?
    var onMoveDown: (() -> Void)?
    let onDelete: () -> Void

    @State private var name: String
    @State private var emoji: String

    init(group: PinGroup, pinCount: Int, onRename: @escaping (String, String?) -> Void, onMoveUp: (() -> Void)?, onMoveDown: (() -> Void)?, onDelete: @escaping () -> Void) {
        self.group = group
        self.pinCount = pinCount
        self.onRename = onRename
        self.onMoveUp = onMoveUp
        self.onMoveDown = onMoveDown
        self.onDelete = onDelete
        _name = State(initialValue: group.name)
        _emoji = State(initialValue: group.emoji ?? "")
    }

    var body: some View {
        HStack(spacing: 8) {
            TextField("", text: $emoji)
                .textFieldStyle(.plain)
                .frame(width: 24)
                .onChange(of: emoji) { _, newValue in onRename(name, newValue.isEmpty ? nil : newValue) }

            TextField("", text: $name)
                .textFieldStyle(.plain)
                .onChange(of: name) { _, newValue in onRename(newValue, emoji.isEmpty ? nil : emoji) }

            Text("\(pinCount) pin\(pinCount == 1 ? "" : "s")")
                .font(Theme.Font.caption)
                .foregroundStyle(Theme.Color.secondaryText)

            Spacer()

            Button(action: { onMoveUp?() }) { Image(systemName: "chevron.up") }
                .buttonStyle(.notion)
                .disabled(onMoveUp == nil)
            Button(action: { onMoveDown?() }) { Image(systemName: "chevron.down") }
                .buttonStyle(.notion)
                .disabled(onMoveDown == nil)
            Button(action: onDelete) {
                Image(systemName: "trash")
                    .foregroundStyle(Theme.Color.danger)
            }
            .buttonStyle(.notion)
        }
        .padding(.vertical, 2)
    }
}
