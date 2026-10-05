import AppKit
import NotionKit

/// Runs a scripted timeline over the real UI (through `DockController`'s demo hooks, the editor
/// and the capture/menu-bar controllers) with a fake cursor and human pacing, for recordings.
/// Talks to `scripts/record-demo.sh` through marker files: `shot-ready` → waits for `shot-go`;
/// `shot-<name>` → waits for `shot-<name>-done` (a still was taken); `shot-done` at the end.
@MainActor
final class DemoDirector {
    private static var current: DemoDirector?

    let dock: DockController
    let menuBar: MenuBarController
    let screen: NSScreen
    let backdrop: DemoBackdrop
    let cursor = DemoCursor.shared
    let keyHUD = DemoKeyHUD()
    private var raiser: Timer?

    static func start(dock: DockController, menuBar: MenuBarController) {
        let director = DemoDirector(dock: dock, menuBar: menuBar)
        current = director
        Task { await director.run() }
    }

    private init(dock: DockController, menuBar: MenuBarController) {
        self.dock = dock
        self.menuBar = menuBar
        screen = NSScreen.screens.first ?? NSScreen.main!
        backdrop = DemoBackdrop(screen: screen)
    }

    /// Screen-relative point: fractions of the screen's width and height (origin bottom-left).
    func at(_ fx: CGFloat, _ fy: CGFloat) -> CGPoint {
        CGPoint(x: screen.frame.minX + screen.frame.width * fx, y: screen.frame.minY + screen.frame.height * fy)
    }

    private func run() async {
        log("start panel \(panelWindow.frame) visibleFrame \(screen.visibleFrame)")
        NSApp.activate(ignoringOtherApps: true)
        startRaiser()
        cursor.install(on: screen, at: at(0.42, 0.42))
        cursor.setVisible(false)
        await DemoUI.sleep(0.5)
        log("after 0.5s panel \(panelWindow.frame)")
        if DemoMode.trigger.script == "probe" {
            DemoMode.mark("ready")
            await runProbe()
            DemoMode.finish()
            return
        }
        if DemoMode.trigger.script == "notes" {
            DemoMode.mark("ready")
            await runNotes()
            DemoMode.finish()
            return
        }
        await warmUp()
        log("screen \(screen.frame) panel \(panelWindow.frame) level \(panelWindow.level.rawValue) visible \(panelWindow.isVisible) resting \(dock.demoRestingPoint) icon \(String(describing: dock.demoIconFrame(pinID: DemoContent.groceriesPinID)))")
        for w in NSApp.windows { log("window \(type(of: w)) \(w.frame) level \(w.level.rawValue) visible \(w.isVisible) alpha \(w.alphaValue)") }
        DemoMode.mark("ready")
        await waitFor("go", timeout: 30)
        log("go received")
        cursor.setVisible(true)
        await DemoUI.sleep(0.8)
        switch DemoMode.trigger.script ?? "full" {
        default:
            await runFull()
        }
        DemoMode.mark("done")
        await waitFor("done-done", timeout: 120)
        DemoMode.finish()
    }

    /// Loads every pin once while nothing is being recorded, so panels open instantly.
    private func warmUp() async {
        await DemoUI.sleep(1.5)
        for id in [DemoContent.sprintPinID, DemoContent.launchPinID, DemoContent.groceriesPinID] {
            log("warm open \(id)")
            dock.demoOpen(pinID: id)
            await DemoUI.sleep(1.4)
        }
        dock.demoSetPhase(.resting)
        log("warm resting phase \(dock.demoPhase)")
        await DemoUI.sleep(2.5)
    }

    /// Keeps every Brink window (notch, popovers, menus, toasts, capture box) above the backdrop.
    private func startRaiser() {
        let raise = { [weak self] in
            guard let self else { return }
            let floor = DemoBackdrop.level.rawValue
            for window in NSApp.windows where window.isVisible && window !== self.backdrop.window && window.level.rawValue <= floor
                && !String(describing: type(of: window)).contains("StatusBar") {
                window.level = NSWindow.Level(rawValue: floor + 1)
            }
        }
        raise()
        raiser = Timer.scheduledTimer(withTimeInterval: 0.03, repeats: true) { _ in MainActor.assumeIsolated { raise() } }
    }

    /// Debug trace for tuning the timeline (`<markers>/demo.log`).
    func log(_ line: String) {
        guard let dir = DemoMode.trigger.markerDirectory else { return }
        let url = URL(fileURLWithPath: dir).appendingPathComponent("demo.log")
        let data = Data((String(format: "%.3f ", Date().timeIntervalSince1970) + line + "\n").utf8)
        if let handle = try? FileHandle(forWritingTo: url) {
            handle.seekToEndOfFile(); handle.write(data); try? handle.close()
        } else {
            try? data.write(to: url)
        }
    }

    // MARK: - Capture-script handshake

    /// Asks the capture script for a still and waits (briefly) until it was taken.
    func shot(_ name: String) async {
        DemoMode.mark(name)
        await waitFor("\(name)-done", timeout: 3)
    }

    private func waitFor(_ name: String, timeout: Double) async {
        guard let dir = DemoMode.trigger.markerDirectory else { await DemoUI.sleep(min(timeout, 0.5)); return }
        let url = URL(fileURLWithPath: dir).appendingPathComponent("shot-\(name)")
        let deadline = Date().addingTimeInterval(timeout)
        while !FileManager.default.fileExists(atPath: url.path), Date() < deadline {
            await DemoUI.sleep(0.05)
        }
    }

    // MARK: - Cursor verbs

    func move(to point: CGPoint?, _ duration: Double = 0.7, shape: DemoCursor.Shape = .arrow) async {
        guard let point else { return }
        cursor.set(.arrow)
        await cursor.move(to: point, duration: duration)
        cursor.set(shape)
    }

    func click() async { await cursor.press() }

    var panelWindow: NSWindow { dock.demoPanel }

    var capturePanel: NSWindow? {
        NSApp.windows.first { $0 is QuickCapturePanel && $0.isVisible }
    }

    var popoverWindow: NSWindow? {
        NSApp.windows.first { $0.isVisible && String(describing: type(of: $0)).contains("Popover") }
    }
}
