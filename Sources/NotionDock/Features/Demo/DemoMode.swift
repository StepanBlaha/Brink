import AppKit
import NotionKit

/// Scripted marketing-recording mode. It is enabled ONLY by a trigger file,
/// `~/Library/Application Support/NotionDock/demo-mode.json` (`{"script": "full"}`), read once at
/// launch. In demo mode the app talks to an in-process fake Notion (`DemoNotionServer`), keeps
/// pins/cache in a throwaway folder, never reads or writes the Keychain, and restores the user's
/// preferences when it quits. `scripts/record-demo.sh` writes the trigger file and records.
@MainActor
enum DemoMode {
    struct Trigger: Decodable {
        var script: String?
        /// Folder the director drops `shot-<name>` marker files into for the capture script.
        var markerDirectory: String?
    }

    private(set) static var isActive = false
    /// Demo-only stand-in for the pointer (synthetic drags, parking the real mouse's influence).
    static var mouseOverride: CGPoint?
    /// The pointer as the dock sees it: the override in demo mode, else the real mouse.
    static var mouseLocation: CGPoint { (isActive ? mouseOverride : nil) ?? NSEvent.mouseLocation }
    private(set) static var trigger = Trigger()
    private static var savedDefaults: [String: Any]?

    static var triggerFile: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("NotionDock", isDirectory: true)
            .appendingPathComponent("demo-mode.json")
    }

    static let storageDirectory = FileManager.default.temporaryDirectory
        .appendingPathComponent("BrinkDemo-\(ProcessInfo.processInfo.processIdentifier)", isDirectory: true)

    /// Demo mode's stand-in for the app-group container (snapshot + inbox), never the real one.
    static var sharedDirectory: URL {
        let url = storageDirectory.appendingPathComponent("shared", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private static var bundleID: String { Bundle.main.bundleIdentifier ?? "cz.stepanblaha.notiondock" }
    private static var defaultsBackupFile: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("BrinkDemo-defaults-backup.plist")
    }

    /// Call first thing at launch, before `Settings.shared` or any store exists.
    static func bootstrap() {
        restoreDefaultsBackupIfLeftOver()
        guard let data = try? Data(contentsOf: triggerFile) else { return }
        trigger = (try? JSONDecoder().decode(Trigger.self, from: data)) ?? Trigger()
        isActive = true
        AppStorageLocation.demoOverrideDirectory = storageDirectory

        // Snapshot the real preferences (restored on quit, and from the backup file if the
        // demo crashed), then pin down the demo's look in the volatile argument domain.
        let domain = UserDefaults.standard.persistentDomain(forName: bundleID) ?? [:]
        savedDefaults = domain
        (domain as NSDictionary).write(to: defaultsBackupFile, atomically: true)
        // Optional `"defaults": {...}` in the trigger overrides the demo's look (probe runs).
        let overrides = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any])?["defaults"] as? [String: Any] ?? [:]
        UserDefaults.standard.setVolatileDomain(demoDefaults.merging(overrides) { $1 }, forName: UserDefaults.argumentDomain)

        NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { cleanUp() }
        }
    }

    private static var demoDefaults: [String: Any] {
        [
            "dockEdge": "right",
            "pillStyle": "line",
            "displayPreference": "main",
            "dockSize": "large",
            "accentPreset": "blue",
            "notchOutline": true,
            "soundsEnabled": false,
            "menuBarListEnabled": true,
            "badgeMode": "open",
            "pillProgressMode": "off",
            "onboardingCompleted": true,
            // The user's real group id must not leak into the demo (or its widget snapshot).
            "activeGroupID": "",
            "NotionDock.quickCapture.lastPinID": DemoContent.sprintPinID,
            "lastOpenedPinID": DemoContent.launchPinID,
        ]
    }

    /// Adds the sample pins to the (empty, temporary) pin store.
    static func seedPins(into store: PinStore) {
        guard isActive, store.pins.isEmpty else { return }
        for pin in (trigger.script == "notes" ? DemoContent.notesPins : DemoContent.pins) { store.add(pin) }
    }

    /// Quits the demo: restores preferences, removes the temp folder and the trigger file.
    static func finish() {
        NSApp.terminate(nil)
    }

    private static func cleanUp() {
        guard isActive else { return }
        UserDefaults.standard.setVolatileDomain([:], forName: UserDefaults.argumentDomain)
        if let savedDefaults {
            UserDefaults.standard.setPersistentDomain(savedDefaults, forName: bundleID)
            UserDefaults.standard.synchronize()
        }
        try? FileManager.default.removeItem(at: defaultsBackupFile)
        try? FileManager.default.removeItem(at: storageDirectory)
        try? FileManager.default.removeItem(at: triggerFile)
        DemoCursor.shared.restoreSystemCursor()
    }

    private static func restoreDefaultsBackupIfLeftOver() {
        guard let backup = NSDictionary(contentsOf: defaultsBackupFile) as? [String: Any] else { return }
        UserDefaults.standard.setPersistentDomain(backup, forName: bundleID)
        try? FileManager.default.removeItem(at: defaultsBackupFile)
    }

    /// Tells the capture script "take still `name` now" and waits long enough for it.
    static func mark(_ name: String) {
        guard let dir = trigger.markerDirectory else { return }
        let url = URL(fileURLWithPath: dir).appendingPathComponent("shot-\(name)")
        try? Data().write(to: url)
    }
}
