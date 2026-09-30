import Foundation

/// The built-in virtual "Today" pin. It is not stored in `PinStore`; `DockController` injects
/// it at the top of the strip when `Settings.showTodayPin` is on.
enum TodayPin {
    static let id = "brink.today"
    static let title = "Today"
    static let emoji = "\u{2600}\u{FE0F}"

    static func isToday(_ id: String?) -> Bool { id == Self.id }

    static var item: PinItem {
        PinItem(id: id, title: title, icon: .emoji(emoji), isDatabase: false)
    }
}
