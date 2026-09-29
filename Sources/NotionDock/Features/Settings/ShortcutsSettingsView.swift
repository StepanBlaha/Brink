import SwiftUI
import NotionKit

struct ShortcutsSettingsView: View {
    @State private var hotkeys = HotkeySettings.shared
    @State private var recording: HotkeyAction?
    @State private var message: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Shortcuts")
                .font(Theme.Font.title)
                .foregroundStyle(Theme.Color.text)

            ForEach(HotkeyAction.allCases) { action in
                row(action)
            }

            if let message {
                Text(message)
                    .font(Theme.Font.caption)
                    .foregroundStyle(Theme.Color.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text("Click a field, then press the new combo. Esc cancels. \"Open pin 1–9\" only uses the modifiers you press.")
                .font(Theme.Font.caption)
                .foregroundStyle(Theme.Color.tertiaryText)
                .fixedSize(horizontal: false, vertical: true)
            Spacer()
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func row(_ action: HotkeyAction) -> some View {
        HStack(spacing: 10) {
            Text(action.title)
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.text)
            Spacer()
            ZStack {
                Text(recording == action ? "Press keys…" : KeyNames.display(hotkeys.combo(for: action), action: action))
                    .font(Theme.Font.small.monospaced())
                    .foregroundStyle(recording == action ? Theme.Color.accent : Theme.Color.text)
                    .frame(width: 130, height: 26)
                    .background(RoundedRectangle(cornerRadius: Theme.Metrics.radius).fill(Theme.Color.hover))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Metrics.radius).stroke(recording == action ? Theme.Color.accent : .clear, lineWidth: 1))
                ShortcutRecorder(isRecording: Binding(
                    get: { recording == action },
                    set: { recording = $0 ? action : (recording == action ? nil : recording) }
                )) { combo in
                    if let clash = hotkeys.set(combo, for: action) {
                        message = "\(KeyNames.display(combo, action: action)) is already used by \"\(clash.title)\"."
                    } else {
                        message = nil
                    }
                }
                .frame(width: 130, height: 26)
            }
            Button("Reset") {
                if let clash = hotkeys.reset(action) {
                    message = "Default is in use by \"\(clash.title)\"; change that one first."
                } else { message = nil }
            }
            .buttonStyle(.notion)
            .font(Theme.Font.caption)
            .foregroundStyle(Theme.Color.secondaryText)
            .disabled(hotkeys.isDefault(action))
            .opacity(hotkeys.isDefault(action) ? 0.3 : 1)
        }
    }
}
