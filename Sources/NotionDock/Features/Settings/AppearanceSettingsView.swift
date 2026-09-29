import SwiftUI
import AppKit
import ServiceManagement
import NotionKit

/// Appearance & window: accent, size, edge, display, resting pill, badge, launch at login.
struct AppearanceSettingsView: View {
    @State private var settings = Settings.shared
    @State private var screens = NSScreen.screens.map { ScreenInfo(name: $0.localizedName, frame: $0.frame) }
    @State private var hasHardwareNotch = NSScreen.screens.contains { $0.safeAreaInsets.top > 0 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Appearance")
                    .font(Theme.Font.title)
                    .foregroundStyle(Theme.Color.text)

                field("Accent color") { accentGrid }

                field("Size") {
                    segmented(DockSize.allCases, selection: $settings.size, label: \.displayName).frame(maxWidth: 320)
                }

                field("Dock edge") {
                    segmented([DockEdge.left, .top, .right], selection: $settings.edge, label: \.displayName).frame(maxWidth: 240)
                    if settings.edge == .top, hasHardwareNotch {
                        Toggle("Merge with hardware notch", isOn: $settings.mergeWithHardwareNotch)
                            .toggleStyle(.checkbox)
                            .font(Theme.Font.small)
                            .foregroundStyle(Theme.Color.secondaryText)
                        hint("Off: the notch sits just right of the camera housing.")
                    }
                }

                field("Outline") {
                    Toggle("Light edge around the notch", isOn: $settings.notchOutline)
                        .toggleStyle(.checkbox)
                        .font(Theme.Font.small)
                        .foregroundStyle(Theme.Color.secondaryText)
                    hint("Keeps the notch visible on black wallpapers and dark apps.")
                }

                field("Display") {
                    Picker("", selection: displayBinding) {
                        Text("Main display").tag(DisplayPreference.main.stored)
                        Text("Display with mouse").tag(DisplayPreference.mouse.stored)
                        Divider()
                        ForEach(Array(screens.enumerated()), id: \.offset) { _, screen in
                            Text(screen.name).tag(DisplayPreference.named(name: screen.name, frame: screen.frame).stored)
                        }
                    }
                    .labelsHidden()
                    .frame(maxWidth: 260)
                }

                field("Badge") {
                    segmented(BadgeMode.allCases, selection: $settings.badgeMode, label: \.displayName).frame(maxWidth: 320)
                }

                field("Resting pill") {
                    segmented(PillStyle.allCases, selection: $settings.pillStyle, label: \.displayName).frame(maxWidth: 320)
                    if settings.pillStyle == .percent {
                        Picker("", selection: $settings.pillShowsFraction) {
                            Text("7/12").tag(true)
                            Text("58%").tag(false)
                        }
                        .pickerStyle(.segmented).labelsHidden().frame(maxWidth: 160)
                    }
                    hint("The edge hot zone still reveals the strip even with the pill hidden.")
                }

                field("Pill progress (Line and Percent)") {
                    segmented(PillProgressMode.allCases, selection: $settings.pillProgressMode, label: \.displayName).frame(maxWidth: 320)
                }

                field("Startup") { LaunchAtLoginRow() }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didChangeScreenParametersNotification)) { _ in
            screens = NSScreen.screens.map { ScreenInfo(name: $0.localizedName, frame: $0.frame) }
            hasHardwareNotch = NSScreen.screens.contains { $0.safeAreaInsets.top > 0 }
        }
    }

    private var displayBinding: Binding<String> {
        Binding(
            get: { settings.displayPreference.stored },
            set: { settings.displayPreference = DisplayPreference(stored: $0) }
        )
    }

    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
            content()
        }
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(Theme.Font.caption)
            .foregroundStyle(Theme.Color.tertiaryText)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func segmented<T: Hashable>(_ items: [T], selection: Binding<T>, label: KeyPath<T, String>) -> some View {
        Picker("", selection: selection) {
            ForEach(items, id: \.self) { Text($0[keyPath: label]).tag($0) }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
    }

    private var accentGrid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 6), spacing: 10) {
            ForEach(AccentPreset.allCases) { preset in
                VStack(spacing: 4) {
                    Circle()
                        .fill(preset.color)
                        .frame(width: 26, height: 26)
                        .overlay(
                            Circle().stroke(Theme.Color.text, lineWidth: settings.accentPreset == preset ? 2 : 0)
                        )
                        .overlay(
                            preset == .system ? AnyView(Image(systemName: "circle.lefthalf.filled").font(.system(size: 11)).foregroundStyle(.white)) : AnyView(EmptyView())
                        )
                    Text(preset.displayName)
                        .font(Theme.Font.caption)
                        .foregroundStyle(Theme.Color.secondaryText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .contentShape(Rectangle())
                .onTapGesture { settings.accentPreset = preset }
            }
        }
    }
}

/// "Launch at login" via `SMAppService.mainApp`, showing the live status; when macOS wants
/// approval it offers a shortcut to Login Items settings.
private struct LaunchAtLoginRow: View {
    @State private var status = SMAppService.mainApp.status
    @State private var errorMessage: String?

    private var isOn: Binding<Bool> {
        Binding(
            get: { status == .enabled || status == .requiresApproval },
            set: { setEnabled($0) }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle("Launch Brink at login", isOn: isOn)
                .toggleStyle(.checkbox)
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.secondaryText)
            Text(statusText)
                .font(Theme.Font.caption)
                .foregroundStyle(status == .requiresApproval ? Theme.Color.danger : Theme.Color.tertiaryText)
            if status == .requiresApproval {
                Button("Open Login Items settings") { SMAppService.openSystemSettingsLoginItems() }
                    .buttonStyle(.notion)
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Theme.Color.hover)
                    .foregroundStyle(Theme.Color.text)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.radius))
            }
            if let errorMessage {
                Text(errorMessage).font(Theme.Font.caption).foregroundStyle(Theme.Color.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .onAppear { status = SMAppService.mainApp.status }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            status = SMAppService.mainApp.status
        }
    }

    private var statusText: String {
        switch status {
        case .enabled: return "Enabled."
        case .requiresApproval: return "Requires approval in System Settings → General → Login Items."
        case .notRegistered: return "Not enabled."
        case .notFound: return "Unavailable: run the bundled Brink.app (not a bare build) to enable this."
        @unknown default: return "Unknown status."
        }
    }

    private func setEnabled(_ enabled: Bool) {
        errorMessage = nil
        do {
            if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            errorMessage = error.localizedDescription
        }
        status = SMAppService.mainApp.status
    }
}
