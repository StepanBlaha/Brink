import Foundation

extension Notification.Name {
    /// Ask the notch to open a pin. `object` is the pin id (String).
    static let openPinInNotchRequested = Notification.Name("NotionDock.openPinInNotchRequested")
}

/// Menu-bar-only preferences (kept out of `Settings` so they don't collide with other work).
enum MenuBarPrefs {
    static let showCountKey = "menuBarShowOpenCount"
    static var showCount: Bool { UserDefaults.standard.bool(forKey: showCountKey) }
}
