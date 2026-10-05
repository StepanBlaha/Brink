import AppKit
import ApplicationServices
import OSAKit
import NotionKit

/// Runs JavaScript-for-Automation against Notes through OSAKit. Scripts run one at a time on a
/// private serial queue, never on the main thread (an Apple event can block while Notes launches
/// or the permission prompt is up).
struct OSAScriptRunner: AppleScriptRunning {
    private static let queue = DispatchQueue(label: "cz.stepanblaha.brink.notes-osa", qos: .userInitiated)

    func run(_ source: String) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            Self.queue.async {
                guard let language = OSALanguage(forName: "JavaScript") else {
                    continuation.resume(throwing: NotesError.scriptFailed("JavaScript for Automation is unavailable"))
                    return
                }
                let script = OSAScript(source: source, language: language)
                var info: NSDictionary?
                let result = script.executeAndReturnError(&info)
                if let info {
                    let number = (info[OSAScriptErrorNumber] as? NSNumber)?.intValue ?? 0
                    let message = (info[OSAScriptErrorMessage] as? String) ?? "unknown error"
                    // -1743: Automation denied. -1744 would need consent (never prompted here).
                    if number == -1743 || number == -1744 {
                        continuation.resume(throwing: NotesError.permissionDenied)
                    } else if message.contains("NOT_FOUND") {
                        continuation.resume(throwing: NotesError.notFound)
                    } else {
                        continuation.resume(throwing: NotesError.scriptFailed(message))
                    }
                    return
                }
                continuation.resume(returning: result?.stringValue ?? "null")
            }
        }
    }
}

/// macOS Automation consent for "Brink wants to control Notes".
enum NotesPermission {
    static let bundleID = "com.apple.Notes"

    static var notesURL: URL? { NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleID) }

    private static let grantedKey = "NotionDock.notes.accessGranted"

    static var isRunning: Bool { !NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).isEmpty }

    /// Remembered so background refreshes know access was granted without launching Notes.
    private static var grantedBefore: Bool {
        get { UserDefaults.standard.bool(forKey: grantedKey) }
        set { UserDefaults.standard.set(newValue, forKey: grantedKey) }
    }

    /// Reads the current consent without ever prompting (or launching Notes).
    static func current() async -> NotesAccessStatus {
        guard notesURL != nil else { return .notAvailable }
        var status = await query(prompt: false)
        // macOS can only answer for a running target; fall back to what we last saw.
        if status == .unknown, !isRunning, grantedBefore { status = .allowed }
        record(status)
        return status
    }

    private static func record(_ status: NotesAccessStatus) {
        if status == .allowed { grantedBefore = true } else if status == .denied { grantedBefore = false }
    }

    /// Launches Notes (hidden) if needed and asks macOS for consent, showing the system prompt.
    @MainActor
    static func request() async -> NotesAccessStatus {
        guard let url = notesURL else { return .notAvailable }
        if NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).isEmpty {
            let configuration = NSWorkspace.OpenConfiguration()
            configuration.activates = false
            configuration.hides = true
            _ = try? await NSWorkspace.shared.openApplication(at: url, configuration: configuration)
            for _ in 0..<20 where NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).isEmpty {
                try? await Task.sleep(nanoseconds: 250_000_000)
            }
        }
        let status = await query(prompt: true)
        record(status)
        return status
    }

    private static func query(prompt: Bool) async -> NotesAccessStatus {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                var address = AEAddressDesc()
                let created = bundleID.withCString { AECreateDesc(DescType(typeApplicationBundleID), $0, strlen($0), &address) }
                guard created == noErr else { continuation.resume(returning: .unknown); return }
                defer { AEDisposeDesc(&address) }
                let wildcard = OSType(0x2A2A2A2A)   // '****'
                let status = AEDeterminePermissionToAutomateTarget(&address, wildcard, wildcard, prompt)
                switch status {
                case noErr: continuation.resume(returning: .allowed)
                case -1743: continuation.resume(returning: .denied)
                default: continuation.resume(returning: .unknown)
                }
            }
        }
    }
}
