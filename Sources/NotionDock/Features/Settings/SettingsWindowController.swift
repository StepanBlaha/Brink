import AppKit
import SwiftUI

/// A small standard, titled, closable window for token settings — deliberately not an NSPanel,
/// since it needs normal window chrome and to be able to take app activation.
@MainActor
final class SettingsWindowController: NSWindowController {
    private let navigation: SettingsNavigation

    convenience init(appModel: AppModel) {
        let navigation = SettingsNavigation()
        let hosting = NSHostingController(rootView: SettingsView(appModel: appModel, navigation: navigation))
        let window = NSWindow(contentViewController: hosting)
        window.appearance = NSAppearance(named: .darkAqua)
        window.title = "Brink Settings"
        window.styleMask = [.titled, .closable, .miniaturizable]
        window.isReleasedWhenClosed = false
        window.setContentSize(NSSize(width: 560, height: 540))
        window.center()
        self.init(window: window, navigation: navigation)
    }

    private init(window: NSWindow?, navigation: SettingsNavigation) {
        self.navigation = navigation
        super.init(window: window)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func show(section: SettingsSection = .connection) {
        navigation.section = section
        if let window { AppWindows.shared.track(window) }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }
}
