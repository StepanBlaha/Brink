import Foundation

extension NaturalDate {
    private static let b = #"(?<![\p{L}\p{N}])"#
    private static let e = #"(?![\p{L}\p{N}])"#
    private static let lead = #"(?:(?<![\p{L}\p{N}])(?:on|at|by|v|ve|do|na)\s+)?"#

    static func datePatterns() -> [Pattern] {
        let months = NaturalDateVocabulary.alternation(Array(NaturalDateVocabulary.months.keys))
        let weekdays = NaturalDateVocabulary.alternation(Array(NaturalDateVocabulary.weekdays.keys))
        let units = NaturalDateVocabulary.alternation(Array(NaturalDateVocabulary.units.keys))
        let nextWord = #"(?:(?<![\p{L}\p{N}])(?:next|příští|pristi|this|tento|tuto|tuhle)\s+)?"#

        return [
            // 2026-10-15
            (rx("\(lead)\(b)(\\d{4})-(\\d{2})-(\\d{2})\(e)"), { m, ns, c in
                guard let y = Int(group(m, 1, ns)!), let mo = Int(group(m, 2, ns)!), let d = Int(group(m, 3, ns)!),
                      let date = c.make(year: y, month: mo, day: d) else { return nil }
                return Hit(range: m.range, date: date)
            }),
            // 15.10. / 15. 10. 2026 / 15.10.2026
            (rx("\(lead)\(b)(\\d{1,2})\\s*\\.\\s*(\\d{1,2})\\s*\\.(?:\\s*(\\d{4}))?(?!\\d)"), { m, ns, c in
                guard let d = Int(group(m, 1, ns)!), let mo = Int(group(m, 2, ns)!),
                      (1...12).contains(mo), let date = c.make(year: group(m, 3, ns).flatMap { Int($0) }, month: mo, day: d)
                else { return nil }
                return Hit(range: m.range, date: date)
            }),
            // Oct 15, October 15th 2026
            (rx("\(lead)\(b)(\(months))\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?![\\d:])(?:,?\\s+(\\d{4})(?![\\d:]))?"), { m, ns, c in
                guard let mo = NaturalDateVocabulary.months[group(m, 1, ns)!.lowercased()], let d = Int(group(m, 2, ns)!),
                      let date = c.make(year: group(m, 3, ns).flatMap { Int($0) }, month: mo, day: d) else { return nil }
                return Hit(range: m.range, date: date)
            }),
            // 15 Oct, 15. října 2026
            (rx("\(lead)\(b)(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s*(?:of\\s+)?(\(months))\(e)(?:,?\\s+(\\d{4})(?![\\d:]))?"), { m, ns, c in
                guard let d = Int(group(m, 1, ns)!), let mo = NaturalDateVocabulary.months[group(m, 2, ns)!.lowercased()],
                      let date = c.make(year: group(m, 3, ns).flatMap { Int($0) }, month: mo, day: d) else { return nil }
                return Hit(range: m.range, date: date)
            }),
            // today / tomorrow / day after tomorrow (EN + CS)
            (rx("\(lead)\(b)(day after tomorrow|pozítří|pozitri|tomorrow|tmrw|zítra|zitra|today|dnes|dneska|tonight)\(e)"), { m, ns, c in
                let offset: Int
                switch group(m, 1, ns)!.lowercased() {
                case "day after tomorrow", "pozítří", "pozitri": offset = 2
                case "tomorrow", "tmrw", "zítra", "zitra": offset = 1
                default: offset = 0
                }
                return Hit(range: m.range, date: c.day(offset))
            }),
            // next week / příští týden -> Monday
            (rx("\(b)(next week|příští týden|pristi tyden|příštím týdnu)\(e)"), { m, _, c in
                Hit(range: m.range, date: nextOccurrence(weekday: 2, after: c.now, calendar: c.calendar))
            }),
            // in 3 days / za 3 dny / za týden / in 2 hours
            (rx("\(b)(?:in|za)\\s+(?:(\\d+|an?)\\s+)?(\(units))\(e)"), { m, ns, c in
                let countText = group(m, 1, ns)?.lowercased()
                let n = countText.flatMap { Int($0) } ?? 1
                guard n > 0, n < 1000, let unit = NaturalDateVocabulary.units[group(m, 2, ns)!.lowercased()] else { return nil }
                if unit == .hour {
                    guard let d = c.calendar.date(byAdding: .hour, value: n, to: c.now) else { return nil }
                    return Hit(range: m.range, date: d, hasTime: true)
                }
                guard let d = c.calendar.date(byAdding: unit, value: n, to: c.startOfToday) else { return nil }
                return Hit(range: m.range, date: d)
            }),
            // (next) Friday / v pátek
            (rx("\(lead)\(nextWord)\(b)(\(weekdays))\(e)"), { m, ns, c in
                guard let wd = NaturalDateVocabulary.weekdays[group(m, 1, ns)!.lowercased()] else { return nil }
                return Hit(range: m.range, date: nextOccurrence(weekday: wd, after: c.now, calendar: c.calendar))
            }),
        ]
    }

    static func timePatterns() -> [Pattern] {
        let at = #"(?:(?<![\p{L}\p{N}])(?:at|@|v|ve)\s+)?"#
        return [
            // 5pm, 5:30 PM, 12am
            (rx("\(at)\(b)(\\d{1,2})(?::(\\d{2}))?\\s*([ap])\\.?m\\.?\(e)"), { m, ns, c in
                guard var h = Int(group(m, 1, ns)!), (1...12).contains(h) else { return nil }
                let min = group(m, 2, ns).flatMap { Int($0) } ?? 0
                guard min < 60 else { return nil }
                let pm = group(m, 3, ns)!.lowercased() == "p"
                if h == 12 { h = pm ? 12 : 0 } else if pm { h += 12 }
                return timeHit(m.range, h, min, c)
            }),
            // 17:00
            (rx("\(at)\(b)([01]?\\d|2[0-3]):([0-5]\\d)(?![\\p{N}:])"), { m, ns, c in
                timeHit(m.range, Int(group(m, 1, ns)!)!, Int(group(m, 2, ns)!)!, c)
            }),
        ]
    }

    private static func timeHit(_ range: NSRange, _ h: Int, _ min: Int, _ c: Context) -> Hit? {
        guard let d = c.calendar.date(bySettingHour: h, minute: min, second: 0, of: c.startOfToday) else { return nil }
        return Hit(range: range, date: d, hasTime: true)
    }
}
