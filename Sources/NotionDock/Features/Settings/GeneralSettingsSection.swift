import SwiftUI

struct GeneralSettingsSection: View {
    @State private var settings = Settings.shared
    @AppStorage(MenuBarPrefs.showCountKey) private var showCount = false

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("General")
                .font(Theme.Font.title)
                .foregroundStyle(Theme.Color.text)

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Toggle("Sounds", isOn: Binding(get: { settings.soundsEnabled }, set: { settings.soundsEnabled = $0 }))
                    Button("Test") { SoundService.shared.play() }
                        .buttonStyle(.notion)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(Theme.Color.hover)
                        .foregroundStyle(Theme.Color.text)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.radius))
                }
                caption("A soft tick when you check something off.")
            }

            VStack(alignment: .leading, spacing: 10) {
                Toggle("Menu-bar mini-list", isOn: Binding(get: { settings.menuBarListEnabled }, set: { settings.menuBarListEnabled = $0 }))
                caption("Left-click the menu-bar icon for a quick list of open to-dos. Right-click or ⌥-click for the menu.")
                Toggle("Show open count in menu bar", isOn: $showCount)
                    .disabled(!settings.menuBarListEnabled)
            }

            VStack(alignment: .leading, spacing: 10) {
                Button("Show welcome again") {
                    Onboarding.isCompleted = false
                    NotificationCenter.default.post(name: .showWelcomeRequested, object: nil)
                }
                .buttonStyle(.notion)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(Theme.Color.hover, in: RoundedRectangle(cornerRadius: Theme.Metrics.radius))
                caption("Replay the short setup: connect Notion and pin a page.")
            }
            Spacer()
        }
        .toggleStyle(.switch)
        .font(Theme.Font.body)
        .foregroundStyle(Theme.Color.text)
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func caption(_ text: String) -> some View {
        Text(text).font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
    }
}
