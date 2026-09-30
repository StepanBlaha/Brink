import Foundation

public struct ReminderSettings: Sendable, Equatable {
    /// Hour (0-23) a date-only task is notified at.
    public var dateOnlyHour: Int
    public var morningSummaryEnabled: Bool
    /// Minutes after midnight the morning summary fires at.
    public var morningSummaryMinutes: Int

    public init(dateOnlyHour: Int = 9, morningSummaryEnabled: Bool = false, morningSummaryMinutes: Int = 8 * 60) {
        self.dateOnlyHour = min(max(dateOnlyHour, 0), 23)
        self.morningSummaryEnabled = morningSummaryEnabled
        self.morningSummaryMinutes = min(max(morningSummaryMinutes, 0), 24 * 60 - 1)
    }
}

/// One local notification the app wants pending.
public struct ReminderRequest: Sendable, Equatable {
    public enum Kind: String, Sendable { case item, summary }
    public let identifier: String
    public let kind: Kind
    public let title: String
    public let body: String
    public let fireDate: Date
    public let pinId: String?
    public let itemId: String?
}

/// Turns due items into the notifications to schedule. Pure: no UserNotifications here.
public enum ReminderPlanner {
    /// macOS keeps at most 64 pending local notifications per app.
    public static let maxPending = 64
    public static let itemPrefix = "brink.reminder.item."
    public static let summaryPrefix = "brink.reminder.summary."
    /// Morning summaries planned ahead (today if still upcoming, then the next days).
    public static let summaryDaysAhead = 3

    /// - Items whose fire time is already past are skipped (no retroactive alerts); they still
    ///   count as "overdue" in the morning summary.
    /// - Date-only items fire at `dateOnlyHour` on their day; timed items at their time.
    /// - The result is sorted soonest first and cut to `limit`.
    public static func plan(items: [DueItem], pinTitles: [String: String] = [:], now: Date, settings: ReminderSettings,
                            calendar: Calendar = .current, limit: Int = maxPending) -> [ReminderRequest] {
        var requests: [ReminderRequest] = []
        for item in items {
            let fire = fireDate(for: item, hour: settings.dateOnlyHour, calendar: calendar)
            guard fire > now else { continue }
            let when = item.hasTime ? "Due at " + timeLabel(item.due, calendar: calendar) : "Due today"
            let body = [pinTitles[item.pinId], when].compactMap { $0 }.joined(separator: " \u{00B7} ")
            requests.append(ReminderRequest(identifier: itemPrefix + item.pinId + "." + item.id, kind: .item,
                                            title: item.title, body: body, fireDate: fire, pinId: item.pinId, itemId: item.id))
        }
        if settings.morningSummaryEnabled {
            requests.append(contentsOf: summaries(items: items, now: now, minutes: settings.morningSummaryMinutes, calendar: calendar))
        }
        requests.sort { $0.fireDate == $1.fireDate ? $0.identifier < $1.identifier : $0.fireDate < $1.fireDate }
        return Array(requests.prefix(max(limit, 0)))
    }

    public static func fireDate(for item: DueItem, hour: Int, calendar: Calendar = .current) -> Date {
        if item.hasTime { return item.due }
        let day = calendar.startOfDay(for: item.due)
        return calendar.date(bySettingHour: hour, minute: 0, second: 0, of: day) ?? day
    }

    private static func summaries(items: [DueItem], now: Date, minutes: Int, calendar: Calendar) -> [ReminderRequest] {
        var result: [ReminderRequest] = []
        let today = calendar.startOfDay(for: now)
        for offset in 0..<summaryDaysAhead {
            guard let day = calendar.date(byAdding: .day, value: offset, to: today),
                  let fire = calendar.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: day),
                  fire > now else { continue }
            let nextDay = calendar.date(byAdding: .day, value: 1, to: day) ?? day
            let dueThatDay = items.filter { $0.due >= day && $0.due < nextDay }.count
            let overdue = items.filter { $0.due < day }.count
            guard dueThatDay + overdue > 0 else { continue }
            var body = dueThatDay == 1 ? "1 task due today" : "\(dueThatDay) tasks due today"
            if dueThatDay == 0 { body = "\(overdue) overdue" } else if overdue > 0 { body += " \u{00B7} \(overdue) overdue" }
            result.append(ReminderRequest(identifier: summaryPrefix + DueKey.dayKey(day, calendar: calendar), kind: .summary,
                                          title: "Brink", body: body, fireDate: fire, pinId: nil, itemId: nil))
        }
        return result
    }

    private static func timeLabel(_ date: Date, calendar: Calendar) -> String {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = calendar.timeZone
        f.timeStyle = .short
        f.dateStyle = .none
        return f.string(from: date)
    }
}

enum DueKey {
    static func dayKey(_ date: Date, calendar: Calendar) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}
