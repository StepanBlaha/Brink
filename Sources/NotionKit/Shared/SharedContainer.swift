import Foundation
import Security

/// The App Group container shared by Brink, its widget and its Share extension.
/// Foundation-only on purpose: the extensions compile the `Shared/` files directly.
public enum SharedContainer {
    public static let appGroupID = "FW5CYB98R7.cz.stepanblaha.brink"
    /// Darwin notification posted by extensions after appending to the inbox.
    public static let inboxNotificationName = "cz.stepanblaha.brink.inbox"
    /// URL scheme used by widget links: `brink://pin/<pinID>`.
    public static let urlScheme = "brink"

    /// Tests point this at a temp directory.
    nonisolated(unsafe) public static var overrideDirectory: URL?

    public static var directory: URL? {
        if let overrideDirectory { return overrideDirectory }
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID)
    }

    public static var snapshotURL: URL? { directory?.appendingPathComponent("widget-snapshot.json") }
    public static var inboxURL: URL? { directory?.appendingPathComponent("inbox.jsonl") }

    /// Whether this process is signed with the app-group entitlement. The SwiftPM ad-hoc build
    /// is not, and touching another team's group container there would trigger a privacy prompt.
    public static var isEntitled: Bool {
        guard let task = SecTaskCreateFromSelf(nil),
              let value = SecTaskCopyValueForEntitlement(task, "com.apple.security.application-groups" as CFString, nil)
        else { return false }
        return (value as? [String])?.contains(appGroupID) ?? false
    }

    /// Whether the shared files can be used: a signed build with the group, or an override
    /// directory (tests, and demo mode's private stand-in for the group container).
    public static var isUsable: Bool { overrideDirectory != nil || isEntitled }

    public static func postInboxNotification() {
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        CFNotificationCenterPostNotification(center, CFNotificationName(inboxNotificationName as CFString), nil, nil, true)
    }

    public static func pinURL(_ pinID: String) -> URL? {
        var c = URLComponents()
        c.scheme = urlScheme
        c.host = "pin"
        c.path = "/" + pinID
        return c.url
    }

    /// Parses `brink://pin/<id>` back to the pin id.
    public static func pinID(from url: URL) -> String? {
        guard url.scheme == urlScheme, url.host == "pin" else { return nil }
        let id = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return id.isEmpty ? nil : id
    }
}
