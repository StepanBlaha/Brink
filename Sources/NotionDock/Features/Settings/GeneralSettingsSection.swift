import SwiftUI

struct GeneralSettingsSection: View {
    @State private var settings = Settings.shared
    private var reminders = ReminderService.shared
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
                Toggle("Show Today pin", isOn: Binding(get: { settings.showTodayPin }, set: { settings.showTodayPin = $0 }))
                caption("A \u{2600}\u{FE0F} pin at the top of the strip listing every task due today or overdue.")
            }

            remindersGroup

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

    private var remindersGroup: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle("Due reminders", isOn: Binding(get: { settings.remindersEnabled }, set: { settings.remindersEnabled = $0 }))
            caption("Notifies you when a task in a pinned database with a date is due.")
            if reminders.permissionDenied {
                Text("Notifications are blocked for Brink. Allow them in System Settings \u{2192} Notifications.")
                    .font(Theme.Font.small).foregroundStyle(Theme.Color.danger)
            }
            if settings.remindersEnabled {
                Picker("Remind date-only tasks at", selection: Binding(get: { settings.reminderHour }, set: { settings.reminderHour = $0 })) {
                    ForEach(0..<24, id: \.self) { Text(String(format: "%d:00", $0)).tag($0) }
                }
                .frame(maxWidth: 260)
                Toggle("Morning summary", isOn: Binding(get: { settings.morningSummaryEnabled }, set: { settings.morningSummaryEnabled = $0 }))
                if settings.morningSummaryEnabled {
                    DatePicker("Summary time", selection: summaryTime, displayedComponents: .hourAndMinute)
                        .frame(maxWidth: 260)
                    caption("For example \u{201C}5 tasks due today\u{201D}.")
                }
                Toggle("Peek the notch for reminders", isOn: Binding(get: { settings.peekForReminders }, set: { settings.peekForReminders = $0 }))
                caption("Unfolds the notch for 3 seconds on the pin when a reminder fires while Brink is running.")
            }
        }
    }

    private var summaryTime: Binding<Date> {
        Binding(
            get: { Calendar.current.date(bySettingHour: settings.morningSummaryMinutes / 60, minute: settings.morningSummaryMinutes % 60, second: 0, of: Date()) ?? Date() },
            set: {
                let c = Calendar.current.dateComponents([.hour, .minute], from: $0)
                settings.morningSummaryMinutes = (c.hour ?? 8) * 60 + (c.minute ?? 0)
            }
        )
    }

    private func caption(_ text: String) -> some View {
        Text(text).font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
    }
}
