import Testing
import Foundation
@testable import NotionKit

@Suite("NaturalDate")
struct NaturalDateTests {
    // Tuesday 2026-09-29 10:00 in Prague.
    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Prague")!
        c.firstWeekday = 2
        return c
    }()
    static let now = calendar.date(from: DateComponents(year: 2026, month: 9, day: 29, hour: 10, minute: 0))!

    private func parse(_ text: String) -> NaturalDateResult {
        NaturalDate.parse(text, now: Self.now, calendar: Self.calendar)
    }

    private func iso(_ r: NaturalDateResult) -> String? {
        r.date.map { NaturalDate.isoString($0, hasTime: r.hasTime, timeZone: Self.calendar.timeZone) }
    }

    @Test("date phrases strip and resolve", arguments: [
        ("Buy milk tomorrow", "Buy milk", "2026-09-30"),
        ("Buy milk today", "Buy milk", "2026-09-29"),
        ("tomorrow buy milk", "buy milk", "2026-09-30"),
        ("Call mom day after tomorrow", "Call mom", "2026-10-01"),
        ("Koupit mléko zítra", "Koupit mléko", "2026-09-30"),
        ("Koupit mléko zitra", "Koupit mléko", "2026-09-30"),
        ("Koupit mléko dnes", "Koupit mléko", "2026-09-29"),
        ("Zavolat pozítří", "Zavolat", "2026-10-01"),
        ("Report friday", "Report", "2026-10-02"),
        ("Report on Friday", "Report", "2026-10-02"),
        ("Report next monday", "Report", "2026-10-05"),
        ("Report tuesday", "Report", "2026-10-06"),
        ("Zavolat v pátek", "Zavolat", "2026-10-02"),
        ("Schůzka pondělí", "Schůzka", "2026-10-05"),
        ("Schůzka ve středu", "Schůzka", "2026-09-30"),
        ("Výlet neděli", "Výlet", "2026-10-04"),
        ("Plan next week", "Plan", "2026-10-05"),
        ("Plán příští týden", "Plán", "2026-10-05"),
        ("Pay rent in 3 days", "Pay rent", "2026-10-02"),
        ("Pay rent in 2 weeks", "Pay rent", "2026-10-13"),
        ("Zaplatit za 3 dny", "Zaplatit", "2026-10-02"),
        ("Zaplatit za týden", "Zaplatit", "2026-10-06"),
        ("Zaplatit za 5 dní", "Zaplatit", "2026-10-04"),
        ("Odevzdat 15.10.", "Odevzdat", "2026-10-15"),
        ("Odevzdat 15. 10. 2026", "Odevzdat", "2026-10-15"),
        ("Odevzdat 1.3.", "Odevzdat", "2027-03-01"),
        ("Odevzdat 15. října", "Odevzdat", "2026-10-15"),
        ("Submit Oct 15", "Submit", "2026-10-15"),
        ("Submit October 15th", "Submit", "2026-10-15"),
        ("Submit 15 Oct", "Submit", "2026-10-15"),
        ("Submit Jan 5", "Submit", "2027-01-05"),
        ("Submit Jan 5 2028", "Submit", "2028-01-05"),
        ("Submit 2026-11-02", "Submit", "2026-11-02"),
    ])
    func dates(input: String, title: String, expected: String) {
        let r = parse(input)
        #expect(r.cleanTitle == title)
        #expect(iso(r) == expected)
        #expect(!r.hasTime)
    }

    @Test("times combine with dates", arguments: [
        ("Meet tomorrow 5pm", "Meet", "2026-09-30T17:00:00+02:00"),
        ("Meet tomorrow at 5:30 PM", "Meet", "2026-09-30T17:30:00+02:00"),
        ("Meet friday 17:00", "Meet", "2026-10-02T17:00:00+02:00"),
        ("Schůzka zítra v 17:00", "Schůzka", "2026-09-30T17:00:00+02:00"),
        ("Lunch 12pm today", "Lunch", "2026-09-29T12:00:00+02:00"),
        ("Alarm 12am tomorrow", "Alarm", "2026-09-30T00:00:00+02:00"),
        ("Call 17:00", "Call", "2026-09-29T17:00:00+02:00"),
        ("Call 9am", "Call", "2026-09-30T09:00:00+02:00"),
        ("Stretch in 2 hours", "Stretch", "2026-09-29T12:00:00+02:00"),
        ("Protáhnout za hodinu", "Protáhnout", "2026-09-29T11:00:00+02:00"),
    ])
    func times(input: String, title: String, expected: String) {
        let r = parse(input)
        #expect(r.cleanTitle == title)
        #expect(r.hasTime)
        #expect(iso(r) == expected)
    }

    @Test("text without a date is untouched", arguments: [
        "Buy milk", "Read chapter 3", "Call Sat", "Fix bug #12", "Version 2.5 release", "",
    ])
    func noDate(input: String) {
        let r = parse(input)
        #expect(r.date == nil)
        #expect(r.cleanTitle == input.trimmingCharacters(in: .whitespaces))
    }

    @Test("a phrase that is the whole text is kept as the title")
    func wholeTextIsNotStripped() {
        let r = parse("tomorrow")
        #expect(r.date == nil)
        #expect(r.cleanTitle == "tomorrow")
    }

    @Test("date in the middle is removed cleanly")
    func middle() {
        let r = parse("Call mom tomorrow about the trip")
        #expect(r.cleanTitle == "Call mom about the trip")
        #expect(iso(r) == "2026-09-30")
    }

    @Test("nextOccurrence is strictly after")
    func nextOcc() {
        let d = NaturalDate.nextOccurrence(weekday: 3, after: Self.now, calendar: Self.calendar) // Tuesday
        #expect(NaturalDate.isoString(d, hasTime: false, timeZone: Self.calendar.timeZone) == "2026-10-06")
    }

    @Test("snooze targets")
    func snooze() {
        let cal = Self.calendar
        func f(_ r: (date: Date, hasTime: Bool)) -> String { NaturalDate.isoString(r.date, hasTime: r.hasTime, timeZone: cal.timeZone) }
        let evening = cal.date(from: DateComponents(year: 2026, month: 9, day: 29, hour: 18, minute: 30))!
        #expect(f(SnoozeCalculator.target(.laterToday, current: evening, currentHasTime: true, now: Self.now, calendar: cal)) == "2026-09-29T13:00:00+02:00")
        #expect(f(SnoozeCalculator.target(.tomorrow, current: nil, currentHasTime: false, now: Self.now, calendar: cal)) == "2026-09-30")
        #expect(f(SnoozeCalculator.target(.tomorrow, current: evening, currentHasTime: true, now: Self.now, calendar: cal)) == "2026-09-30T18:30:00+02:00")
        #expect(f(SnoozeCalculator.target(.nextWeek, current: evening, currentHasTime: false, now: Self.now, calendar: cal)) == "2026-10-05")
    }
}
