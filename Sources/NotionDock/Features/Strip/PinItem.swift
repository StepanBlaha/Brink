import Foundation

/// How a pin's icon should be drawn — either the emoji Notion (or a fallback first letter)
/// gives it, or one of the user's custom overrides from the icon picker.
enum PinIconDisplay: Equatable {
    case emoji(String)
    case sfSymbol(name: String, colorHex: UInt32)
    case letter(text: String, colorHex: UInt32)
}

struct PinItem: Identifiable, Equatable {
    let id: String
    let title: String
    let icon: PinIconDisplay
}

/// Display model for the strip's group switcher.
struct PinGroupItem: Identifiable, Equatable {
    let id: String
    let name: String
    let emoji: String?
}
