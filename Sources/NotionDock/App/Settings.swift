import AppKit
import SwiftUI
import Observation
import NotionKit

enum DockEdge: String {
    case left
    case right
    case top

    var kind: NotchEdge {
        switch self {
        case .left: return .left
        case .right: return .right
        case .top: return .top
        }
    }

    var displayName: String {
        switch self {
        case .left: return "Left"
        case .right: return "Right"
        case .top: return "Top"
        }
    }
}

/// Notch size preset. Scales notch metrics and base font sizes.
enum DockSize: String, CaseIterable, Identifiable {
    case small
    case medium
    case large

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .small: return "Small"
        case .medium: return "Medium"
        case .large: return "Large"
        }
    }

    /// Scales notch metrics (depth/length/icon size).
    var metricsScale: CGFloat {
        switch self {
        case .small: return 0.85
        case .medium: return 1
        case .large: return 1.2
        }
    }

    /// Scales base font sizes.
    var fontScale: CGFloat {
        switch self {
        case .small: return 0.93
        case .medium: return 1
        case .large: return 1.1
        }
    }
}

/// An accent color preset. `.system` follows `NSColor.controlAccentColor` (updates live if the
/// user changes their macOS accent color, since we read it fresh each access).
enum AccentPreset: String, CaseIterable, Identifiable {
    case pink, red, orange, yellow, green, teal, blue, indigo, purple, offWhite, system

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .pink: return "Pink"
        case .red: return "Red"
        case .orange: return "Orange"
        case .yellow: return "Yellow"
        case .green: return "Green"
        case .teal: return "Teal"
        case .blue: return "Blue"
        case .indigo: return "Indigo"
        case .purple: return "Purple"
        case .offWhite: return "Off-White"
        case .system: return "System accent"
        }
    }

    /// Fixed hex for every preset except `.system`, which tracks the live system accent color.
    var hex: UInt32? {
        switch self {
        case .pink: return 0xFF375F
        case .red: return 0xFF453A
        case .orange: return 0xFF9F0A
        case .yellow: return 0xFFD60A
        case .green: return 0x32D74B
        case .teal: return 0x40C8E0
        case .blue: return 0x0A84FF
        case .indigo: return 0x5E5CE6
        case .purple: return 0xBF5AF2
        case .offWhite: return 0xF2F2F0
        case .system: return nil
        }
    }

    var color: SwiftUI.Color {
        if let hex {
            return SwiftUI.Color(hex: hex)
        }
        return SwiftUI.Color(nsColor: .controlAccentColor)
    }

    /// A concrete hex snapshot, resolving `.system` from the current `NSColor.controlAccentColor`
    /// at call time — for storing into `CustomIcon`, which needs a fixed hex rather than a
    /// live-tracking reference.
    var resolvedHex: UInt32 {
        if let hex { return hex }
        let color = NSColor.controlAccentColor.usingColorSpace(.sRGB) ?? .controlAccentColor
        let r = UInt32((color.redComponent * 255).rounded())
        let g = UInt32((color.greenComponent * 255).rounded())
        let b = UInt32((color.blueComponent * 255).rounded())
        return (r << 16) | (g << 8) | b
    }
}

/// What the strip/rail count badge shows.
enum BadgeMode: String, CaseIterable, Identifiable {
    case off, open, dueToday
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .off: return "Off"
        case .open: return "Open items"
        case .dueToday: return "Due today"
        }
    }
}

/// What the resting pill's progress fill measures.
enum PillProgressMode: String, CaseIterable, Identifiable {
    case off, activeGroup, lastPin
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .off: return "Off"
        case .activeGroup: return "Active group"
        case .lastPin: return "Last pin"
        }
    }
}

/// App-wide, persisted (UserDefaults-backed) settings. `@Observable` so every open SwiftUI
/// view — the notch, the strip, the settings window — updates live the instant any of these
/// change, with no manual notification plumbing.
@Observable
final class Settings {
    static let shared = Settings()

    private let defaults = UserDefaults.standard
    private let edgeKey = "dockEdge"
    private let restingPillHiddenKey = "restingPillHidden"
    private let accentPresetKey = "accentPreset"
    private let sizeKey = "dockSize"
    private let activeGroupIDKey = "activeGroupID"

    var edge: DockEdge {
        didSet { defaults.set(edge.rawValue, forKey: edgeKey); postLayoutChange() }
    }

    /// The resting pill's look. Migrated from the old `restingPillHidden` boolean.
    var pillStyle: PillStyle {
        didSet { defaults.set(pillStyle.rawValue, forKey: "pillStyle") }
    }

    /// Legacy accessor (menu items): the resting pill is invisible when `.hidden`, but the
    /// edge hot zone still works — hovering near the screen edge still unfolds the strip.
    var restingPillHidden: Bool {
        get { pillStyle == .hidden }
        set {
            if newValue { pillStyle = .hidden } else if pillStyle == .hidden { pillStyle = .line }
        }
    }

    /// The Percent pill shows "7/12" when true, "58%" otherwise.
    var pillShowsFraction: Bool {
        didSet { defaults.set(pillShowsFraction, forKey: "pillShowsFraction") }
    }

    /// Which display hosts the notch.
    var displayPreference: DisplayPreference {
        didSet { defaults.set(displayPreference.stored, forKey: "displayPreference"); postLayoutChange() }
    }

    /// Top edge on a Mac with a hardware notch: merge with it instead of sitting to its right.
    var mergeWithHardwareNotch: Bool {
        didSet { defaults.set(mergeWithHardwareNotch, forKey: "mergeWithHardwareNotch"); postLayoutChange() }
    }

    /// Posted when the edge, display or hardware-notch option changes, so `DockController`
    /// can reposition the (AppKit) panel.
    static let layoutDidChangeNotification = Notification.Name("DockSettingsLayoutDidChange")

    private func postLayoutChange() {
        NotificationCenter.default.post(name: Settings.layoutDidChangeNotification, object: nil)
    }

    var accentPreset: AccentPreset {
        didSet { defaults.set(accentPreset.rawValue, forKey: accentPresetKey) }
    }

    var size: DockSize {
        didSet {
            defaults.set(size.rawValue, forKey: sizeKey)
            NotificationCenter.default.post(name: Settings.sizeDidChangeNotification, object: nil)
        }
    }

    /// Posted after `size` changes. `Theme.Notch`/`Theme.Font` already read the new value live
    /// via Observation for anything drawn in SwiftUI, but `DockController` also needs to resize
    /// and reposition the (AppKit) panel itself, which this notification triggers.
    static let sizeDidChangeNotification = Notification.Name("DockSettingsSizeDidChange")

    /// The live accent color, resolved from `accentPreset`.
    var accentColor: SwiftUI.Color { accentPreset.color }

    /// The strip's active pin group. `nil` means "All pins" (every pin, regardless of group) —
    /// also the default, so a user with no groups sees exactly the old, ungrouped behavior.
    var activeGroupID: String? {
        didSet {
            if let activeGroupID {
                defaults.set(activeGroupID, forKey: activeGroupIDKey)
            } else {
                defaults.removeObject(forKey: activeGroupIDKey)
            }
        }
    }

    var badgeMode: BadgeMode {
        didSet { defaults.set(badgeMode.rawValue, forKey: "badgeMode") }
    }

    var pillProgressMode: PillProgressMode {
        didSet { defaults.set(pillProgressMode.rawValue, forKey: "pillProgressMode") }
    }

    /// Thin light rim around the notch so it stays visible on black wallpapers / dark apps.
    var notchOutline: Bool {
        didSet { defaults.set(notchOutline, forKey: "notchOutline") }
    }

    /// Soft tick sound when something is checked off.
    var soundsEnabled: Bool {
        didSet { defaults.set(soundsEnabled, forKey: "soundsEnabled") }
    }

    /// Show the menu-bar mini-list (status item popover with pins and open tasks).
    var menuBarListEnabled: Bool {
        didSet { defaults.set(menuBarListEnabled, forKey: "menuBarListEnabled") }
    }

    /// Show the built-in "Today" pin at the top of the strip.
    var showTodayPin: Bool {
        didSet { defaults.set(showTodayPin, forKey: "showTodayPin"); NotificationCenter.default.post(name: .todayPinSettingChanged, object: nil) }
    }

    /// Due reminders (local notifications). Turning this on asks for permission (`ReminderService`).
    var remindersEnabled: Bool {
        didSet { defaults.set(remindersEnabled, forKey: "remindersEnabled"); ReminderService.settingsChanged() }
    }

    /// Hour (0-23) date-only tasks are notified at.
    var reminderHour: Int {
        didSet { defaults.set(reminderHour, forKey: "reminderHour"); ReminderService.settingsChanged() }
    }

    var morningSummaryEnabled: Bool {
        didSet { defaults.set(morningSummaryEnabled, forKey: "morningSummaryEnabled"); ReminderService.settingsChanged() }
    }

    /// Minutes after midnight the morning summary fires at.
    var morningSummaryMinutes: Int {
        didSet { defaults.set(morningSummaryMinutes, forKey: "morningSummaryMinutes"); ReminderService.settingsChanged() }
    }

    /// Unfold the notch for 3 seconds on the pin when a reminder fires while the app runs.
    var peekForReminders: Bool {
        didSet { defaults.set(peekForReminders, forKey: "peekForReminders"); ReminderService.settingsChanged() }
    }

    /// The pin (id) most recently opened; ⌥Space re-opens it. Persisted across launches.
    var lastOpenedPinID: String? {
        didSet {
            if let lastOpenedPinID { defaults.set(lastOpenedPinID, forKey: "lastOpenedPinID") }
            else { defaults.removeObject(forKey: "lastOpenedPinID") }
        }
    }

    private init() {
        edge = DockEdge(rawValue: defaults.string(forKey: edgeKey) ?? "") ?? .right
        pillStyle = PillStyle.resolve(
            stored: defaults.string(forKey: "pillStyle"),
            legacyHidden: defaults.object(forKey: restingPillHiddenKey) as? Bool
        )
        pillShowsFraction = defaults.object(forKey: "pillShowsFraction") as? Bool ?? true
        displayPreference = DisplayPreference(stored: defaults.string(forKey: "displayPreference"))
        mergeWithHardwareNotch = defaults.bool(forKey: "mergeWithHardwareNotch")
        accentPreset = AccentPreset(rawValue: defaults.string(forKey: accentPresetKey) ?? "") ?? .blue
        size = DockSize(rawValue: defaults.string(forKey: sizeKey) ?? "") ?? .medium
        activeGroupID = defaults.string(forKey: activeGroupIDKey).flatMap { $0.isEmpty ? nil : $0 }
        badgeMode = BadgeMode(rawValue: defaults.string(forKey: "badgeMode") ?? "") ?? .open
        pillProgressMode = PillProgressMode(rawValue: defaults.string(forKey: "pillProgressMode") ?? "") ?? .off
        soundsEnabled = defaults.object(forKey: "soundsEnabled") as? Bool ?? true
        notchOutline = defaults.object(forKey: "notchOutline") as? Bool ?? true
        menuBarListEnabled = defaults.object(forKey: "menuBarListEnabled") as? Bool ?? true
        lastOpenedPinID = defaults.string(forKey: "lastOpenedPinID")
        showTodayPin = defaults.object(forKey: "showTodayPin") as? Bool ?? true
        remindersEnabled = defaults.bool(forKey: "remindersEnabled")
        reminderHour = defaults.object(forKey: "reminderHour") as? Int ?? 9
        morningSummaryEnabled = defaults.bool(forKey: "morningSummaryEnabled")
        morningSummaryMinutes = defaults.object(forKey: "morningSummaryMinutes") as? Int ?? 8 * 60
        peekForReminders = defaults.object(forKey: "peekForReminders") as? Bool ?? true
    }
}
