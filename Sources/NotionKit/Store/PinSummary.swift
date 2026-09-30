import Foundation

/// Glanceable per-pin counts shown as badges, hover peeks and the live pill.
public struct PinSummary: Sendable, Equatable {
    public var openCount: Int
    public var doneCount: Int
    public var total: Int
    public var dueTodayCount: Int
    /// Titles of the first (up to) three open items.
    public var nextItems: [String]
    /// Ids + titles of the first (up to) `nextRefLimit` open items (for the widget).
    public var nextRefs: [ItemRef] = []
    /// Every open item that has a date (database pins with a date property only).
    public var dueItems: [DueItem] = []

    public struct ItemRef: Sendable, Equatable {
        public let id: String
        public let title: String
        public init(id: String, title: String) { self.id = id; self.title = title }
    }

    public static let nextRefLimit = 7

    public static let empty = PinSummary(openCount: 0, doneCount: 0, total: 0, dueTodayCount: 0, nextItems: [])

    public init(openCount: Int, doneCount: Int, total: Int, dueTodayCount: Int, nextItems: [String]) {
        self.openCount = openCount
        self.doneCount = doneCount
        self.total = total
        self.dueTodayCount = dueTodayCount
        self.nextItems = nextItems
    }

    public static let nextItemLimit = 3

    /// `YYYY-MM-DD` for `date` in `calendar`'s time zone (the format Notion date starts begin with).
    public static func dayString(_ date: Date = Date(), calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Counts to-do blocks in a flat list (top level plus whatever children were loaded).
    public static func fromBlocks(_ blocks: [Block]) -> PinSummary {
        var summary = PinSummary.empty
        for block in blocks {
            guard case .toDo(let checked) = block.type else { continue }
            summary.total += 1
            if checked {
                summary.doneCount += 1
            } else {
                summary.openCount += 1
                let title = block.plainText.trimmingCharacters(in: .whitespacesAndNewlines)
                if !title.isEmpty, summary.nextItems.count < nextItemLimit { summary.nextItems.append(title) }
                if !title.isEmpty, summary.nextRefs.count < nextRefLimit { summary.nextRefs.append(ItemRef(id: block.id, title: title)) }
            }
        }
        return summary
    }

    /// Counts database rows using the pin's config: done = the done property (checkbox true,
    /// or status equal to `doneValue`); due today = an open row whose date property starts today.
    public static func fromRows(_ rows: [Row], config: DatabaseConfig, today: String, pinId: String = "", calendar: Calendar = .current) -> PinSummary {
        var summary = PinSummary.empty
        for row in rows {
            summary.total += 1
            if isDone(row, config: config) {
                summary.doneCount += 1
                continue
            }
            summary.openCount += 1
            let title = row.title.trimmingCharacters(in: .whitespacesAndNewlines)
            if summary.nextItems.count < nextItemLimit { summary.nextItems.append(title.isEmpty ? "Untitled" : title) }
            if summary.nextRefs.count < nextRefLimit { summary.nextRefs.append(ItemRef(id: row.id, title: title.isEmpty ? "Untitled" : title)) }
            if let dateName = config.dateProperty,
               case .date(let start?, _)? = row.properties[dateName],
               start.hasPrefix(today) {
                summary.dueTodayCount += 1
            }
            if let dateName = config.dateProperty,
               case .date(let start?, _)? = row.properties[dateName],
               let parsed = DueDateParser.parse(start, calendar: calendar) {
                summary.dueItems.append(DueItem(id: row.id, pinId: pinId, title: title.isEmpty ? "Untitled" : title, due: parsed.date, hasTime: parsed.hasTime))
            }
        }
        return summary
    }

    public static func isDone(_ row: Row, config: DatabaseConfig) -> Bool {
        switch config.doneKind {
        case .checkbox:
            if case .checkbox(let value)? = row.properties[config.doneProperty] { return value }
            return false
        case .status:
            if case .status(let name)? = row.properties[config.doneProperty] { return name != nil && name == config.doneValue }
            return false
        }
    }

    /// done/total summed over the given summaries; `nil` when there is nothing to measure.
    public static func progressRatio(_ summaries: [PinSummary]) -> Double? {
        let total = summaries.reduce(0) { $0 + $1.total }
        guard total > 0 else { return nil }
        return Double(summaries.reduce(0) { $0 + $1.doneCount }) / Double(total)
    }
}
