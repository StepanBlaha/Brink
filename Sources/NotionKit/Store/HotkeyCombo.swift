import Foundation

/// A key + modifier combination, using Carbon key codes and modifier masks so it can be
/// handed straight to `RegisterEventHotKey` (declared here without importing Carbon).
public struct HotkeyCombo: Sendable, Equatable, Hashable {
    public static let command: UInt32 = 256
    public static let shift: UInt32 = 512
    public static let option: UInt32 = 2048
    public static let control: UInt32 = 4096
    public static let modifierMask: UInt32 = command | shift | option | control

    public var keyCode: UInt32
    public var modifiers: UInt32

    public init(keyCode: UInt32, modifiers: UInt32) {
        self.keyCode = keyCode
        self.modifiers = modifiers & Self.modifierMask
    }

    /// `"<keyCode>:<modifiers>"`, the UserDefaults representation.
    public var encoded: String { "\(keyCode):\(modifiers)" }

    public init?(encoded: String) {
        let parts = encoded.split(separator: ":")
        guard parts.count == 2, let key = UInt32(parts[0]), let mods = UInt32(parts[1]) else { return nil }
        self.init(keyCode: key, modifiers: mods)
    }

    /// Symbols for the modifiers in macOS order (⌃⌥⇧⌘).
    public var modifierSymbols: String {
        var s = ""
        if modifiers & Self.control != 0 { s += "⌃" }
        if modifiers & Self.option != 0 { s += "⌥" }
        if modifiers & Self.shift != 0 { s += "⇧" }
        if modifiers & Self.command != 0 { s += "⌘" }
        return s
    }
}

public enum HotkeyAction: String, Sendable, CaseIterable, Identifiable {
    case toggleLastPin, openPinN, quickCapture, clipboardAppend

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .toggleLastPin: return "Toggle last-opened pin"
        case .openPinN: return "Open pin 1–9 of active group"
        case .quickCapture: return "Quick capture"
        case .clipboardAppend: return "Append clipboard"
        }
    }

    // Carbon virtual key codes.
    public static let spaceKey: UInt32 = 49
    public static let digitKeyCodes: [UInt32] = [18, 19, 20, 21, 23, 22, 26, 28, 25] // 1...9
    public static let vKey: UInt32 = 9

    /// For `.openPinN` the stored combo's key code is ignored; only its modifiers matter.
    public var defaultCombo: HotkeyCombo {
        switch self {
        case .toggleLastPin: return HotkeyCombo(keyCode: Self.spaceKey, modifiers: HotkeyCombo.option)
        case .openPinN: return HotkeyCombo(keyCode: Self.digitKeyCodes[0], modifiers: HotkeyCombo.option)
        case .quickCapture: return HotkeyCombo(keyCode: Self.spaceKey, modifiers: HotkeyCombo.option | HotkeyCombo.shift)
        case .clipboardAppend: return HotkeyCombo(keyCode: Self.vKey, modifiers: HotkeyCombo.option | HotkeyCombo.command)
        }
    }

    /// Every concrete key combo this action occupies (nine for `.openPinN`).
    public func occupiedCombos(_ combo: HotkeyCombo) -> [HotkeyCombo] {
        switch self {
        case .openPinN: return Self.digitKeyCodes.map { HotkeyCombo(keyCode: $0, modifiers: combo.modifiers) }
        default: return [combo]
        }
    }

    /// The pin index (0-based) a fired digit key code maps to, for `.openPinN`.
    public static func pinIndex(forKeyCode code: UInt32) -> Int? {
        digitKeyCodes.firstIndex(of: code)
    }
}

/// The full set of bindings plus pure conflict detection.
public struct HotkeyBindings: Sendable, Equatable {
    public var combos: [HotkeyAction: HotkeyCombo]

    public static let defaults = HotkeyBindings(combos: Dictionary(uniqueKeysWithValues: HotkeyAction.allCases.map { ($0, $0.defaultCombo) }))

    public init(combos: [HotkeyAction: HotkeyCombo]) { self.combos = combos }

    public func combo(for action: HotkeyAction) -> HotkeyCombo { combos[action] ?? action.defaultCombo }

    /// The other action already using any key that `combo` would occupy for `action`, if any.
    public func conflict(for action: HotkeyAction, combo: HotkeyCombo) -> HotkeyAction? {
        let wanted = Set(action.occupiedCombos(combo))
        for other in HotkeyAction.allCases where other != action {
            if !wanted.isDisjoint(with: other.occupiedCombos(self.combo(for: other))) { return other }
        }
        return nil
    }
}
