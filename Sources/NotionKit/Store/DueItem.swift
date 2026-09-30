import Foundation

/// An open database row that has a due date: what reminders and the Today view are built from.
public struct DueItem: Sendable, Equatable, Identifiable {
    public let id: String
    public let pinId: String
    public let title: String
    public let due: Date
    /// True when the Notion date carries a time of day; date-only items are due "that day".
    public let hasTime: Bool

    public init(id: String, pinId: String, title: String, due: Date, hasTime: Bool) {
        self.id = id
        self.pinId = pinId
        self.title = title
        self.due = due
        self.hasTime = hasTime
    }
}

/// Parses the `start` of a Notion date value (`2026-09-30` or `2026-09-30T15:00:00.000+02:00`).
public enum DueDateParser {
    public static func parse(_ start: String, calendar: Calendar = .current) -> (date: Date, hasTime: Bool)? {
        if start.contains("T") {
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime]
            if let d = f.date(from: start) { return (d, true) }
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = f.date(from: start) { return (d, true) }
            // No UTC offset: a floating local time.
            let local = DateFormatter()
            local.locale = Locale(identifier: "en_US_POSIX")
            local.calendar = calendar
            local.timeZone = calendar.timeZone
            for format in ["yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ss.SSS", "yyyy-MM-dd'T'HH:mm"] {
                local.dateFormat = format
                if let d = local.date(from: start) { return (d, true) }
            }
            return nil
        }
        let parts = start.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var c = DateComponents()
        c.year = parts[0]; c.month = parts[1]; c.day = parts[2]
        guard let d = calendar.date(from: c) else { return nil }
        return (calendar.startOfDay(for: d), false)
    }
}
