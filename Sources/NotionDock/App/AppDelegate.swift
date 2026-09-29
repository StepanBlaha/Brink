import AppKit
import NotionKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private var dockController: DockController?
    private var appModel: AppModel?
    private var menuBar: MenuBarController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        MainMenu.install()
        let appModel = AppModel()
        self.appModel = appModel
        dockController = DockController(appModel: appModel)
        AppWindows.shared.onSettings = { [weak self] in self?.dockController?.showSettings() }
        CaptureBootstrap.start(appModel: appModel)
        SharedSnapshotWriter.start(appModel: appModel)
        SharedInboxProcessor.start(appModel: appModel)
        setUpStatusItem()
        NotificationCenter.default.addObserver(forName: .showWelcomeRequested, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.showWelcome() }
        }
        if Onboarding.shouldShow(appModel) { showWelcome() }
    }

    private func showWelcome() {
        guard let appModel else { return }
        AppWindows.shared.showWelcome(appModel: appModel) { [weak self] in self?.dockController?.openAddFlow() }
    }

    /// Widget links: `brink://pin/<id>` opens that pin in the notch.
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            guard let pinID = SharedContainer.pinID(from: url) else { continue }
            NotificationCenter.default.post(name: .openPinInNotchRequested, object: pinID)
        }
    }

    private func setUpStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "sidebar.right", accessibilityDescription: "Brink")
        statusItem = item
        if let appModel {
            let controller = MenuBarController(appModel: appModel)
            controller.onSettings = { [weak self] in self?.dockController?.showSettings() }
            controller.attach(to: item.button)
            menuBar = controller
        }
        item.button?.target = self
        item.button?.action = #selector(statusItemClicked(_:))
        item.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])
    }

    @objc private func statusItemClicked(_ sender: NSStatusBarButton) {
        let event = NSApp.currentEvent
        let alt = event?.modifierFlags.contains(.option) ?? false
        let right = event?.type == .rightMouseUp
        if Settings.shared.menuBarListEnabled, !alt, !right, let menuBar {
            menuBar.toggle()
            return
        }
        // Show the classic menu (temporarily attached so the click pops it).
        statusItem?.menu = buildMenu()
        statusItem?.button?.performClick(nil)
        statusItem?.menu = nil
    }

    private func buildMenu() -> NSMenu {
        let menu = NSMenu()

        let leftItem = NSMenuItem(title: "Dock on Left", action: #selector(dockLeft), keyEquivalent: "")
        leftItem.target = self
        leftItem.state = Settings.shared.edge == .left ? .on : .off
        menu.addItem(leftItem)

        let rightItem = NSMenuItem(title: "Dock on Right", action: #selector(dockRight), keyEquivalent: "")
        rightItem.target = self
        rightItem.state = Settings.shared.edge == .right ? .on : .off
        menu.addItem(rightItem)

        menu.addItem(.separator())

        let showPillItem = NSMenuItem(title: "Resting Pill: Show", action: #selector(setRestingPillShown), keyEquivalent: "")
        showPillItem.target = self
        showPillItem.state = Settings.shared.restingPillHidden ? .off : .on
        menu.addItem(showPillItem)

        let hidePillItem = NSMenuItem(title: "Resting Pill: Hide", action: #selector(setRestingPillHidden), keyEquivalent: "")
        hidePillItem.target = self
        hidePillItem.state = Settings.shared.restingPillHidden ? .on : .off
        menu.addItem(hidePillItem)

        menu.addItem(.separator())

        let aboutItem = NSMenuItem(title: "About Brink", action: #selector(AppWindows.showAbout), keyEquivalent: "")
        aboutItem.target = AppWindows.shared
        menu.addItem(aboutItem)
        menu.addItem(.separator())

        let settingsItem = NSMenuItem(title: "Brink Settings…", action: #selector(openSettings), keyEquivalent: ",")
        settingsItem.target = self
        menu.addItem(settingsItem)

        menu.addItem(.separator())

        for (title, action) in [("Brink Help", #selector(AppWindows.openHelp)), ("Send Feedback…", #selector(AppWindows.sendFeedback)),
                                ("Privacy Policy", #selector(AppWindows.showPrivacy)), ("Terms of Use", #selector(AppWindows.showTerms))] {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
            item.target = AppWindows.shared
            menu.addItem(item)
        }

        menu.addItem(.separator())

        let quitItem = NSMenuItem(title: "Quit Brink", action: #selector(quit), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        return menu
    }

    private func refreshMenu() {}

    @objc private func dockLeft() {
        Settings.shared.edge = .left
        dockController?.edgeDidChange()
        refreshMenu()
    }

    @objc private func dockRight() {
        Settings.shared.edge = .right
        dockController?.edgeDidChange()
        refreshMenu()
    }

    @objc private func setRestingPillShown() {
        Settings.shared.restingPillHidden = false
        dockController?.restingPillVisibilityDidChange()
        refreshMenu()
    }

    @objc private func setRestingPillHidden() {
        Settings.shared.restingPillHidden = true
        dockController?.restingPillVisibilityDidChange()
        refreshMenu()
    }

    @objc private func openSettings() {
        dockController?.showSettings()
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}
