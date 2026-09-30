import Testing
import Foundation
@testable import NotionKit

@Suite("Reminders and Today")
struct ReminderTodayTests {
    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Prague")!
        return c
    }

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0, _ min: Int = 0) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
    }

    private func item(_ id: String, _ due: Date, pin: String = "p1", time: Bool = false, title: String? = nil) -> DueItem {
        DueItem(id: id, pinId: pin, title: title ?? id, due: due, hasTime: time)
    }

    private var now: Date { date(2026, 9, 30, 12, 0) }

    // MARK: - Planner

    @Test("date-only items fire at the chosen hour, timed ones at their time")
    func fireTimes() {
        let items = [item("a", date(2026, 10, 1)), item("b", date(2026, 10, 1, 15, 30), time: true)]
        let plan = ReminderPlanner.plan(items: items, now: now, settings: ReminderSettings(dateOnlyHour: 9), calendar: cal)
        #expect(plan.map(\.itemId) == ["a", "b"])
        #expect(plan[0].fireDate == date(2026, 10, 1, 9, 0))
        #expect(plan[1].fireDate == date(2026, 10, 1, 15, 30))
        let late = ReminderPlanner.plan(items: items, now: now, settings: ReminderSettings(dateOnlyHour: 18), calendar: cal)
        #expect(late.map(\.itemId) == ["b", "a"])
    }

    @Test("past fire times are skipped, including a date-only item whose hour has passed today")
    func skipsPast() {
        let items = [
            item("old", date(2026, 9, 28)),
            item("todayMorning", date(2026, 9, 30)),                         // 9:00 already passed at 12:00
            item("todayEvening", date(2026, 9, 30), title: "later"),
            item("timedPast", date(2026, 9, 30, 8, 0), time: true),
            item("timedSoon", date(2026, 9, 30, 13, 0), time: true),
        ]
        let s = ReminderSettings(dateOnlyHour: 9)
        #expect(ReminderPlanner.plan(items: items, now: now, settings: s, calendar: cal).map(\.itemId) == ["timedSoon"])
        let evening = ReminderSettings(dateOnlyHour: 20)
        #expect(ReminderPlanner.plan(items: items, now: now, settings: evening, calendar: cal).map(\.itemId) == ["timedSoon", "todayEvening", "todayMorning"]) // same fire time: ordered by identifier
    }

    @Test("capped at 64, soonest first")
    func cap() {
        let items = (0..<100).map { item("i\($0)", date(2026, 10, 1, 8, 0).addingTimeInterval(Double(100 - $0) * 60), time: true) }
        let plan = ReminderPlanner.plan(items: items, now: now, settings: ReminderSettings(), calendar: cal)
        #expect(plan.count == 64)
        #expect(plan == plan.sorted { $0.fireDate < $1.fireDate })
        #expect(plan.first?.itemId == "i99")
        #expect(ReminderPlanner.plan(items: items, now: now, settings: ReminderSettings(), calendar: cal, limit: 5).count == 5)
    }

    @Test("morning summary: counts today's tasks and overdue, skips a time that has passed")
    func summary() {
        let items = [item("a", date(2026, 9, 30)), item("b", date(2026, 9, 30)), item("c", date(2026, 9, 28)), item("d", date(2026, 10, 1))]
        let s = ReminderSettings(dateOnlyHour: 9, morningSummaryEnabled: true, morningSummaryMinutes: 8 * 60 + 30)
        let plan = ReminderPlanner.plan(items: items, now: date(2026, 9, 30, 7, 0), settings: s, calendar: cal)
        let sums = plan.filter { $0.kind == .summary }
        #expect(sums.count == 3) // today, tomorrow, and the day after (only overdue left)
        #expect(sums[0].fireDate == date(2026, 9, 30, 8, 30))
        #expect(sums[0].body == "2 tasks due today \u{00B7} 1 overdue")
        #expect(sums[1].body == "1 task due today \u{00B7} 3 overdue")
        #expect(sums[2].body == "4 overdue")
        // Later the same day the 8:30 summary is gone.
        let noon = ReminderPlanner.plan(items: items, now: now, settings: s, calendar: cal).filter { $0.kind == .summary }
        #expect(noon.count == 2 && noon[0].fireDate == date(2026, 10, 1, 8, 30))
        // Off means none.
        let off = ReminderSettings(morningSummaryEnabled: false)
        #expect(ReminderPlanner.plan(items: items, now: now, settings: off, calendar: cal).allSatisfy { $0.kind == .item })
    }

    @Test("identifiers are stable and unique per pin and item")
    func identifiers() {
        let plan = ReminderPlanner.plan(items: [item("x", date(2026, 10, 2), pin: "p1"), item("x", date(2026, 10, 2), pin: "p2")], now: now, settings: ReminderSettings(), calendar: cal)
        #expect(Set(plan.map(\.identifier)).count == 2)
        #expect(plan.allSatisfy { $0.identifier.hasPrefix(ReminderPlanner.itemPrefix) })
    }

    // MARK: - Date parsing / summary

    @Test("date parsing: date-only, offset time, fractional seconds, garbage")
    func parsing() {
        let a = DueDateParser.parse("2026-10-01", calendar: cal)
        #expect(a?.hasTime == false && a?.date == date(2026, 10, 1))
        let b = DueDateParser.parse("2026-10-01T15:30:00.000+02:00", calendar: cal)
        #expect(b?.hasTime == true && b?.date == date(2026, 10, 1, 15, 30))
        #expect(DueDateParser.parse("2026-10-01T15:30:00+02:00", calendar: cal)?.date == date(2026, 10, 1, 15, 30))
        #expect(DueDateParser.parse("nope", calendar: cal) == nil)
    }

    @Test("PinSummary.fromRows collects open dated rows as due items")
    func summaryDueItems() {
        let config = DatabaseConfig(doneProperty: "Done", doneKind: .checkbox, dateProperty: "Due")
        func row(_ id: String, done: Bool, due: String?) -> Row {
            var p: [String: PropertyValue] = ["Name": .title(id), "Done": .checkbox(done)]
            if let due { p["Due"] = .date(start: due, end: nil) }
            return Row(id: id, url: nil, icon: .none, title: id, properties: p)
        }
        let s = PinSummary.fromRows([row("a", done: false, due: "2026-09-30"), row("b", done: true, due: "2026-09-30"),
                                     row("c", done: false, due: nil), row("d", done: false, due: "2026-09-30T10:00:00+02:00")],
                                    config: config, today: "2026-09-30", pinId: "P", calendar: cal)
        #expect(s.dueItems.map(\.id) == ["a", "d"])
        #expect(s.dueItems.allSatisfy { $0.pinId == "P" })
        #expect(s.dueItems.map(\.hasTime) == [false, true])
    }

    // MARK: - Today

    private func pin(_ id: String, _ title: String, kind: PinKind = .dataSource, dated: Bool = true) -> Pin {
        Pin(id: id, notionId: id, kind: kind, title: title, icon: .none, order: 0,
            config: kind == .dataSource ? DatabaseConfig(doneProperty: "Done", doneKind: .checkbox, dateProperty: dated ? "Due" : nil) : nil)
    }

    private func summary(_ items: [DueItem]) -> PinSummary {
        var s = PinSummary.empty
        s.dueItems = items
        return s
    }

    @Test("today: groups by pin, drops future items, page pins and undated databases")
    func grouping() {
        let pins = [pin("p1", "Sprint"), pin("p2", "Home"), pin("page", "Notes", kind: .page), pin("p3", "NoDate", dated: false), pin("p4", "Empty")]
        let summaries = [
            "p1": summary([item("a", date(2026, 9, 30)), item("future", date(2026, 10, 1))]),
            "p2": summary([item("b", date(2026, 9, 29), pin: "p2")]),
            "page": summary([item("z", date(2026, 9, 30), pin: "page")]),
            "p3": summary([item("y", date(2026, 9, 30), pin: "p3")]),
            "p4": summary([item("later", date(2026, 12, 1), pin: "p4")]),
        ]
        let digest = TodayAggregator.aggregate(pins: pins, summaries: summaries, now: now, calendar: cal)
        #expect(digest.sections.map(\.pinTitle) == ["Sprint", "Home"])
        #expect(digest.openCount == 2)
        #expect(digest.overdueCount == 1)
        #expect(!digest.isEmpty)
        #expect(TodayAggregator.aggregate(pins: pins, summaries: [:], now: now, calendar: cal).isEmpty)
    }

    @Test("today: overdue detection for date-only and timed items")
    func overdue() {
        let items = [
            item("yesterday", date(2026, 9, 29)),
            item("todayDateOnly", date(2026, 9, 30)),
            item("timePast", date(2026, 9, 30, 9, 0), time: true),
            item("timeLater", date(2026, 9, 30, 17, 0), time: true),
        ]
        let digest = TodayAggregator.aggregate(pins: [pin("p1", "Sprint")], summaries: ["p1": summary(items)], now: now, calendar: cal)
        let byID = Dictionary(uniqueKeysWithValues: digest.items.map { ($0.id, $0.isOverdue) })
        #expect(byID == ["yesterday": true, "todayDateOnly": false, "timePast": true, "timeLater": false])
    }

    @Test("today: sorted by due date then title; sections keep pin order")
    func sorting() {
        let items = [
            item("c", date(2026, 9, 30), title: "Charlie"), item("a", date(2026, 9, 30), title: "alpha"),
            item("old", date(2026, 9, 20), title: "Zulu"), item("t", date(2026, 9, 30, 16, 0), time: true, title: "Timed"),
        ]
        let digest = TodayAggregator.aggregate(pins: [pin("p1", "Sprint")], summaries: ["p1": summary(items)], now: now, calendar: cal)
        #expect(digest.items.map(\.title) == ["Zulu", "alpha", "Charlie", "Timed"])
    }
}
