import Foundation
import Observation
import NotionKit

/// Persisted hotkey bindings (UserDefaults). Posts `didChange` so `HotkeyCenter` re-registers.
@Observable
final class HotkeySettings {
    static let shared = HotkeySettings()
    static let didChange = Notification.Name("NotionDock.hotkeyBindingsDidChange")

    private let defaults = UserDefaults.standard
    private func key(_ a: HotkeyAction) -> String { "hotkey.\(a.rawValue)" }

    private(set) var bindings: HotkeyBindings
    /// While a shortcut field is recording, global hotkeys are unregistered so the combo reaches the field.
    var isRecording = false {
        didSet { NotificationCenter.default.post(name: Self.didChange, object: nil) }
    }

    private init() {
        var combos = HotkeyBindings.defaults.combos
        for action in HotkeyAction.allCases {
            if let raw = UserDefaults.standard.string(forKey: "hotkey.\(action.rawValue)"), let combo = HotkeyCombo(encoded: raw) {
                combos[action] = combo
            }
        }
        bindings = HotkeyBindings(combos: combos)
    }

    func combo(for action: HotkeyAction) -> HotkeyCombo { bindings.combo(for: action) }

    func isDefault(_ action: HotkeyAction) -> Bool { combo(for: action) == action.defaultCombo }

    /// Returns the conflicting action (and does not bind) if `combo` clashes; otherwise binds.
    @discardableResult
    func set(_ combo: HotkeyCombo, for action: HotkeyAction) -> HotkeyAction? {
        if let clash = bindings.conflict(for: action, combo: combo) { return clash }
        bindings.combos[action] = combo
        defaults.set(combo.encoded, forKey: key(action))
        NotificationCenter.default.post(name: Self.didChange, object: nil)
        return nil
    }

    /// Restores the default. Returns the conflicting action if a custom binding occupies it.
    @discardableResult
    func reset(_ action: HotkeyAction) -> HotkeyAction? {
        if let clash = bindings.conflict(for: action, combo: action.defaultCombo) { return clash }
        bindings.combos[action] = action.defaultCombo
        defaults.removeObject(forKey: key(action))
        NotificationCenter.default.post(name: Self.didChange, object: nil)
        return nil
    }
}
