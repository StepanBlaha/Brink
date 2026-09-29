import Foundation

/// English + Czech word tables for `NaturalDate`. Czech entries include the unaccented
/// spellings people type on a plain keyboard; lookups are lowercase.
enum NaturalDateVocabulary {
    /// Calendar weekday numbers (1 = Sunday ... 7 = Saturday).
    static let weekdays: [String: Int] = [
        "sunday": 1, "neděle": 1, "nedele": 1, "neděli": 1, "nedeli": 1,
        "monday": 2, "pondělí": 2, "pondeli": 2, "pondělka": 2,
        "tuesday": 3, "tue": 3, "tues": 3, "úterý": 3, "utery": 3, "úterka": 3,
        "wednesday": 4, "středa": 4, "streda": 4, "středu": 4, "stredu": 4, "středy": 4,
        "thursday": 5, "thu": 5, "thur": 5, "thurs": 5, "čtvrtek": 5, "ctvrtek": 5, "čtvrtka": 5,
        "friday": 6, "fri": 6, "pátek": 6, "patek": 6, "pátku": 6, "patku": 6,
        "saturday": 7, "sobota": 7, "sobotu": 7, "soboty": 7,
    ]

    static let months: [String: Int] = [
        "january": 1, "jan": 1, "ledna": 1, "leden": 1,
        "february": 2, "feb": 2, "února": 2, "unora": 2, "únor": 2, "unor": 2,
        "march": 3, "mar": 3, "března": 3, "brezna": 3, "březen": 3, "brezen": 3,
        "april": 4, "apr": 4, "dubna": 4, "duben": 4,
        "may": 5, "května": 5, "kvetna": 5, "květen": 5, "kveten": 5,
        "june": 6, "jun": 6, "června": 6, "cervna": 6, "červen": 6, "cerven": 6,
        "july": 7, "jul": 7, "července": 7, "cervence": 7, "červenec": 7, "cervenec": 7,
        "august": 8, "aug": 8, "srpna": 8, "srpen": 8,
        "september": 9, "sept": 9, "sep": 9, "září": 9, "zari": 9,
        "october": 10, "oct": 10, "října": 10, "rijna": 10, "říjen": 10, "rijen": 10,
        "november": 11, "nov": 11, "listopadu": 11, "listopad": 11,
        "december": 12, "dec": 12, "prosince": 12, "prosinec": 12,
    ]

    /// Unit keyword → calendar component for "in N <unit>" / "za N <unit>".
    static let units: [String: Calendar.Component] = [
        "hour": .hour, "hours": .hour, "hr": .hour, "hrs": .hour, "h": .hour,
        "hodinu": .hour, "hodiny": .hour, "hodin": .hour,
        "day": .day, "days": .day, "den": .day, "dny": .day, "dní": .day, "dni": .day, "dnů": .day, "dnu": .day,
        "week": .weekOfYear, "weeks": .weekOfYear, "týden": .weekOfYear, "tyden": .weekOfYear,
        "týdny": .weekOfYear, "tydny": .weekOfYear, "týdnů": .weekOfYear, "tydnu": .weekOfYear,
        "month": .month, "months": .month, "měsíc": .month, "mesic": .month,
        "měsíce": .month, "mesice": .month, "měsíců": .month, "mesicu": .month,
    ]

    static func alternation(_ words: [String]) -> String {
        words.sorted { $0.count > $1.count }.map(NSRegularExpression.escapedPattern(for:)).joined(separator: "|")
    }
}
