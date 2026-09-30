import Foundation

/// App-wide requests fired by global hotkeys (owned by the hotkey layer) and handled by
/// feature controllers. Keeps the hotkey code and the features decoupled.
extension Notification.Name {
    /// Show the quick-capture box (one line → new to-do in the chosen pin).
    static let quickCaptureRequested = Notification.Name("NotionDock.quickCaptureRequested")
    /// Append the clipboard to the most recently opened page pin.
    static let clipboardAppendRequested = Notification.Name("NotionDock.clipboardAppendRequested")
    /// A pin's content changed locally (write synced); summaries/badges should refresh.
    /// `object` is the pin id (String).
    static let pinContentDidChange = Notification.Name("NotionDock.pinContentDidChange")
    /// The "Show Today pin" setting flipped; the dock rebuilds its strip.
    static let todayPinSettingChanged = Notification.Name("NotionDock.todayPinSettingChanged")
    /// A reminder fired while the app runs; `object` is the pin id to peek at.
    static let reminderPeekRequested = Notification.Name("NotionDock.reminderPeekRequested")
}
