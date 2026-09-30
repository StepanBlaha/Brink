import Foundation

public struct TodayItem: Sendable, Equatable, Identifiable {
    public let id: String
    public let pinId: String
    public let title: String
    public let due: Date
    public let hasTime: Bool
    public let isOverdue: Bool

    public init(id: String, pinId: String, title: String, due: Date, hasTime: Bool, isOverdue: Bool) {
        self.id = id; self.pinId = pinId; self.title = title; self.due = due; self.hasTime = hasTime; self.isOverdue = isOverdue
    }
}

public struct TodaySection: Sendable, Equatable, Identifiable {
    public var id: String { pinId }
    public let pinId: String
    public let pinTitle: String
    public let items: [TodayItem]

    public init(pinId: String, pinTitle: String, items: [TodayItem]) {
        self.pinId = pinId; self.pinTitle = pinTitle; self.items = items
    }
}

public struct TodayDigest: Sendable, Equatable {
    public let sections: [TodaySection]
    public init(sections: [TodaySection]) { self.sections = sections }
    public var openCount: Int { sections.reduce(0) { $0 + $1.items.count } }
    public var overdueCount: Int { sections.reduce(0) { $0 + $1.items.filter(\.isOverdue).count } }
    public var isEmpty: Bool { sections.isEmpty }
    public var items: [TodayItem] { sections.flatMap(\.items) }
}

/// Builds the Today view: every open item due today or earlier, grouped by database pin.
public enum TodayAggregator {
    /// Only database pins with a date property take part (page to-dos have no dates).
    public static func isEligible(_ pin: Pin) -> Bool {
        pin.kind == .dataSource && pin.config?.dateProperty != nil
    }

    /// - Sections follow the order of `pins`; empty sections are dropped.
    /// - Items are sorted by due date (so overdue come first), then title.
    /// - Overdue: a timed item whose time has passed, or a date-only item from an earlier day.
    public static func aggregate(pins: [Pin], summaries: [String: PinSummary], now: Date, calendar: Calendar = .current) -> TodayDigest {
        let startOfToday = calendar.startOfDay(for: now)
        let startOfTomorrow = calendar.date(byAdding: .day, value: 1, to: startOfToday) ?? startOfToday
        var sections: [TodaySection] = []
        for pin in pins where isEligible(pin) {
            guard let due = summaries[pin.id]?.dueItems else { continue }
            let items = due
                .filter { $0.due < startOfTomorrow }
                .sorted { $0.due == $1.due ? $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending : $0.due < $1.due }
                .map { item in
                    TodayItem(id: item.id, pinId: pin.id, title: item.title, due: item.due, hasTime: item.hasTime,
                              isOverdue: item.hasTime ? item.due < now : item.due < startOfToday)
                }
            if !items.isEmpty { sections.append(TodaySection(pinId: pin.id, pinTitle: pin.title, items: items)) }
        }
        return TodayDigest(sections: sections)
    }
}
