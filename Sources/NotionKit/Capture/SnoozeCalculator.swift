import Foundation

public enum SnoozeOption: Sendable, Equatable {
    case laterToday, tomorrow, nextWeek
}

/// Where a snoozed task's date lands. Tomorrow/next week keep an existing time of day.
public enum SnoozeCalculator {
    public static func target(_ option: SnoozeOption, current: Date?, currentHasTime: Bool, now: Date = Date(), calendar: Calendar = .current) -> (date: Date, hasTime: Bool) {
        switch option {
        case .laterToday:
            return (calendar.date(byAdding: .hour, value: 3, to: now) ?? now, true)
        case .tomorrow:
            let day = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now
            return applyTime(of: current, hasTime: currentHasTime, to: day, calendar: calendar)
        case .nextWeek:
            let monday = NaturalDate.nextOccurrence(weekday: 2, after: now, calendar: calendar)
            return applyTime(of: current, hasTime: currentHasTime, to: monday, calendar: calendar)
        }
    }

    private static func applyTime(of current: Date?, hasTime: Bool, to day: Date, calendar: Calendar) -> (Date, Bool) {
        guard hasTime, let current else { return (day, false) }
        let c = calendar.dateComponents([.hour, .minute], from: current)
        return (calendar.date(bySettingHour: c.hour ?? 0, minute: c.minute ?? 0, second: 0, of: day) ?? day, true)
    }
}
