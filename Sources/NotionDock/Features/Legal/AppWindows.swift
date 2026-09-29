import AppKit
import SwiftUI

/// Owns the app's small utility windows (About, legal texts, welcome) and shows the Dock icon
/// while any of them, or Settings, is open. Brink is otherwise an accessory (Dock-less) app.
@MainActor
final class AppWindows: NSObject {
    static let shared = AppWindows()

    private var about: NSWindow?
    private var legal: [LegalDocument: NSWindow] = [:]
    private var welcome: NSWindow?
    private var tracked: [NSWindow] = []

    // MARK: Menu-target actions (used by MainMenu and the status menu)

    @objc func showAbout() {
        if about == nil {
            about = makeWindow(title: "About Brink", content: AboutView(), size: NSSize(width: 340, height: 420))
        }
        present(about)
    }

    func showWelcome(appModel: AppModel, addFlow: @escaping () -> Void) {
        welcome?.close()
        let view = OnboardingView(appModel: appModel) { [weak self] openAddFlow in
            Onboarding.isCompleted = true
            self?.welcome?.close()
            self?.welcome = nil
            if openAddFlow { addFlow() }
        }
        welcome = makeWindow(title: "Welcome to Brink", content: view, size: NSSize(width: 460, height: 440))
        present(welcome)
    }

    var onSettings: (() -> Void)?
    @objc func openSettings() { onSettings?() }

    @objc func openHelp() { NSWorkspace.shared.open(Links.help) }
    @objc func sendFeedback() { NSWorkspace.shared.open(Links.feedback) }
    @objc func showPrivacy() { showLegal(.privacy) }
    @objc func showTerms() { showLegal(.terms) }

    func showLegal(_ document: LegalDocument) {
        if legal[document] == nil {
            legal[document] = makeWindow(title: document.title, content: LegalView(document: document), size: NSSize(width: 480, height: 420))
        }
        present(legal[document])
    }

    // MARK: Window plumbing

    func makeWindow<Content: View>(title: String, content: Content, size: NSSize, closable: Bool = true) -> NSWindow {
        let window = NSWindow(contentViewController: NSHostingController(rootView: content))
        window.title = title
        window.styleMask = closable ? [.titled, .closable, .miniaturizable] : [.titled, .miniaturizable]
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = .black
        window.isReleasedWhenClosed = false
        window.setContentSize(size)
        window.center()
        return window
    }

    func present(_ window: NSWindow?) {
        guard let window else { return }
        track(window)
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }

    /// Show the Dock icon while a tracked window is visible; go back to accessory when the last closes.
    func track(_ window: NSWindow) {
        if !tracked.contains(window) {
            tracked.append(window)
            NotificationCenter.default.addObserver(self, selector: #selector(windowWillClose(_:)),
                                                   name: NSWindow.willCloseNotification, object: window)
        }
        NSApp.setActivationPolicy(.regular)
    }

    @objc private func windowWillClose(_ note: Notification) {
        guard let closing = note.object as? NSWindow else { return }
        let stillOpen = tracked.contains { $0 !== closing && $0.isVisible }
        if !stillOpen { NSApp.setActivationPolicy(.accessory) }
    }
}
