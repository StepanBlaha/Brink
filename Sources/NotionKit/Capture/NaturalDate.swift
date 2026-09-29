import Foundation

public struct NaturalDateResult: Equatable, Sendable {
    public let cleanTitle: String
    public let date: Date?
    public let hasTime: Bool
}

/// Parses (and strips) English/Czech date phrases from free text: "buy milk tomorrow 5pm",
/// "zavolat mámě v pátek", "report 15.10.", "in 3 days". Pure and deterministic given `now`.
public enum NaturalDate {
    public static func parse(_ text: String, now: Date = Date(), calendar: Calendar = .current) -> NaturalDateResult {
        let original = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let ns = original as NSString
        let ctx = Context(now: now, calendar: calendar)

        var dateHit = firstHit(in: ns, patterns: datePatterns(), ctx: ctx)
        var timeHit = firstHit(in: ns, patterns: timePatterns(), ctx: ctx)

        // Time pattern must not sit inside the date phrase; a relative-hours date carries its own time.
        if let d = dateHit, let t = timeHit, NSIntersectionRange(d.range, t.range).length > 0 || d.hasTime { timeHit = nil }
        if dateHit == nil, timeHit == nil { return detectorFallback(original, ctx: ctx) }

        var result: Date
        var hasTime = false
        if let d = dateHit {
            result = d.date
            hasTime = d.hasTime
        } else {
            result = ctx.startOfToday
            dateHit = nil
        }
        if let t = timeHit {
            let comps = calendar.dateComponents([.hour, .minute], from: t.date)
            result = calendar.date(bySettingHour: comps.hour ?? 0, minute: comps.minute ?? 0, second: 0, of: result) ?? result
            hasTime = true
            if dateHit == nil, result <= now { // bare "17:00" that already passed means tomorrow
                result = calendar.date(byAdding: .day, value: 1, to: result) ?? result
            }
        }

        let ranges = [dateHit?.range, timeHit?.range].compactMap { $0 }.sorted { $0.location > $1.location }
        var stripped = original as NSString
        for r in ranges { stripped = stripped.replacingCharacters(in: r, with: " ") as NSString }
        let title = clean(stripped as String)
        if title.isEmpty { return NaturalDateResult(cleanTitle: original, date: nil, hasTime: false) }
        return NaturalDateResult(cleanTitle: title, date: result, hasTime: hasTime)
    }

    /// The next date (start of day) falling on `weekday` (1 = Sunday) strictly after `date`.
    public static func nextOccurrence(weekday: Int, after date: Date, calendar: Calendar = .current) -> Date {
        let start = calendar.startOfDay(for: date)
        let current = calendar.component(.weekday, from: start)
        var delta = (weekday - current + 7) % 7
        if delta == 0 { delta = 7 }
        return calendar.date(byAdding: .day, value: delta, to: start) ?? start
    }

    /// Notion date string: `yyyy-MM-dd`, or an offset date-time when `hasTime`.
    public static func isoString(_ date: Date, hasTime: Bool, timeZone: TimeZone = .current) -> String {
        if hasTime {
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime]
            f.timeZone = timeZone
            return f.string(from: date)
        }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    // MARK: - Internals

    struct Context {
        let now: Date
        let calendar: Calendar
        var startOfToday: Date { calendar.startOfDay(for: now) }
        func day(_ offset: Int) -> Date { calendar.date(byAdding: .day, value: offset, to: startOfToday) ?? startOfToday }
        func make(year: Int?, month: Int, day: Int) -> Date? {
            var c = DateComponents(year: year ?? calendar.component(.year, from: now), month: month, day: day)
            guard let d = calendar.date(from: c), calendar.component(.day, from: d) == day else { return nil }
            if year == nil, d < startOfToday { c.year = (c.year ?? 0) + 1; return calendar.date(from: c) }
            return d
        }
    }

    struct Hit {
        let range: NSRange
        let date: Date
        var hasTime = false
    }

    typealias Pattern = (regex: NSRegularExpression, build: (NSTextCheckingResult, NSString, Context) -> Hit?)

    static func firstHit(in ns: NSString, patterns: [Pattern], ctx: Context) -> Hit? {
        let full = NSRange(location: 0, length: ns.length)
        for p in patterns {
            for m in p.regex.matches(in: ns as String, range: full) {
                if let hit = p.build(m, ns, ctx) { return hit }
            }
        }
        return nil
    }

    static func rx(_ pattern: String) -> NSRegularExpression {
        // Patterns are compile-time constants; a failure here is a programmer error.
        try! NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    }

    static func group(_ m: NSTextCheckingResult, _ i: Int, _ ns: NSString) -> String? {
        let r = m.range(at: i)
        return r.location == NSNotFound ? nil : ns.substring(with: r)
    }

    static func clean(_ s: String) -> String {
        let collapsed = s.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        return collapsed.trimmingCharacters(in: CharacterSet.whitespaces.union(CharacterSet(charactersIn: ",;:-–—")))
    }

    private static func detectorFallback(_ original: String, ctx: Context) -> NaturalDateResult {
        let none = NaturalDateResult(cleanTitle: original, date: nil, hasTime: false)
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.date.rawValue) else { return none }
        let ns = original as NSString
        guard let m = detector.firstMatch(in: original, range: NSRange(location: 0, length: ns.length)),
              let date = m.date, m.range.length >= 3, date >= ctx.startOfToday else { return none }
        let phrase = ns.substring(with: m.range).lowercased()
        let hasTime = phrase.contains(":") || phrase.contains("am") || phrase.contains("pm")
        let title = clean(ns.replacingCharacters(in: m.range, with: " "))
        if title.isEmpty { return none }
        return NaturalDateResult(cleanTitle: title, date: hasTime ? date : ctx.calendar.startOfDay(for: date), hasTime: hasTime)
    }
}
