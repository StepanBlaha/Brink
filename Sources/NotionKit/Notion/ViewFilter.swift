import Foundation

/// The operators offered by the saved-view filter builder, one property type at a time
/// (people/relation properties are intentionally not supported — brief calls them out as skipped).
public enum ViewFilterOperator: String, Codable, Sendable, CaseIterable, Equatable {
    case checkboxIs
    case checkboxIsNot
    case statusIs
    case statusIsNot
    case statusIsAnyOf
    case selectIs
    case selectIsNot
    case selectIsAnyOf
    case dateIsToday
    case dateIsBeforeToday
    case dateWithinNext7Days
    case dateIsEmpty
    case titleContains
    case numberGreaterThan
    case numberLessThan

    /// The property `type` (as `PropertySchema.type` reports it) this operator applies to.
    public var propertyType: String {
        switch self {
        case .checkboxIs, .checkboxIsNot: return "checkbox"
        case .statusIs, .statusIsNot, .statusIsAnyOf: return "status"
        case .selectIs, .selectIsNot, .selectIsAnyOf: return "select"
        case .dateIsToday, .dateIsBeforeToday, .dateWithinNext7Days, .dateIsEmpty: return "date"
        case .titleContains: return "title"
        case .numberGreaterThan, .numberLessThan: return "number"
        }
    }

    public static func operators(forPropertyType type: String) -> [ViewFilterOperator] {
        allCases.filter { $0.propertyType == type }
    }

    public var displayName: String {
        switch self {
        case .checkboxIs: return "is"
        case .checkboxIsNot: return "isn't"
        case .statusIs, .selectIs: return "is"
        case .statusIsNot, .selectIsNot: return "is not"
        case .statusIsAnyOf, .selectIsAnyOf: return "is any of"
        case .dateIsToday: return "is today"
        case .dateIsBeforeToday: return "is before today"
        case .dateWithinNext7Days: return "is within next 7 days"
        case .dateIsEmpty: return "is empty"
        case .titleContains: return "contains"
        case .numberGreaterThan: return "is greater than"
        case .numberLessThan: return "is less than"
        }
    }

    /// Whether this operator needs a value (a text/number entry, or select/status option(s)).
    public var needsValue: Bool {
        switch self {
        case .dateIsToday, .dateIsBeforeToday, .dateWithinNext7Days, .dateIsEmpty: return false
        default: return true
        }
    }

    public var needsMultipleOptions: Bool {
        self == .statusIsAnyOf || self == .selectIsAnyOf
    }
}

/// One condition in a pinned database view's filter builder. All of a view's filters are
/// combined with AND (per brief); `optionValues` holds the option name(s) for status/select
/// operators (a single value for is/is not, several for "any of").
public struct ViewFilter: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var property: String
    public var op: ViewFilterOperator
    public var textValue: String?
    public var numberValue: Double?
    public var optionValues: [String]?

    public init(id: String = UUID().uuidString, property: String, op: ViewFilterOperator, textValue: String? = nil, numberValue: Double? = nil, optionValues: [String]? = nil) {
        self.id = id
        self.property = property
        self.op = op
        self.textValue = textValue
        self.numberValue = numberValue
        self.optionValues = optionValues
    }
}

extension ViewFilter {
    /// Translates this condition to the Notion data-source query filter JSON shape documented
    /// at developers.notion.com/reference (checkbox/status/select/date/title/number filter
    /// objects, and the "or" compound filter for "any of"). Returns `nil` if a required value
    /// is missing (e.g. a text-contains filter with an empty string).
    public func requestJSON(referenceDate: Date = Date(), calendar: Calendar = .current) -> JSONValue? {
        switch op {
        case .checkboxIs:
            return propertyFilter("checkbox", ["equals": .bool(true)])
        case .checkboxIsNot:
            return propertyFilter("checkbox", ["equals": .bool(false)])
        case .statusIs:
            guard let name = optionValues?.first else { return nil }
            return propertyFilter("status", ["equals": .string(name)])
        case .statusIsNot:
            guard let name = optionValues?.first else { return nil }
            return propertyFilter("status", ["does_not_equal": .string(name)])
        case .statusIsAnyOf:
            return anyOfFilter(key: "status")
        case .selectIs:
            guard let name = optionValues?.first else { return nil }
            return propertyFilter("select", ["equals": .string(name)])
        case .selectIsNot:
            guard let name = optionValues?.first else { return nil }
            return propertyFilter("select", ["does_not_equal": .string(name)])
        case .selectIsAnyOf:
            return anyOfFilter(key: "select")
        case .dateIsToday:
            return propertyFilter("date", ["equals": .string(Self.isoDate(referenceDate, calendar))])
        case .dateIsBeforeToday:
            return propertyFilter("date", ["before": .string(Self.isoDate(referenceDate, calendar))])
        case .dateWithinNext7Days:
            let end = calendar.date(byAdding: .day, value: 7, to: referenceDate) ?? referenceDate
            return .object(["and": .array([
                propertyFilter("date", ["on_or_after": .string(Self.isoDate(referenceDate, calendar))]),
                propertyFilter("date", ["on_or_before": .string(Self.isoDate(end, calendar))]),
            ])])
        case .dateIsEmpty:
            return propertyFilter("date", ["is_empty": .bool(true)])
        case .titleContains:
            guard let text = textValue, !text.isEmpty else { return nil }
            return propertyFilter("title", ["contains": .string(text)])
        case .numberGreaterThan:
            guard let value = numberValue else { return nil }
            return propertyFilter("number", ["greater_than": .number(value)])
        case .numberLessThan:
            guard let value = numberValue else { return nil }
            return propertyFilter("number", ["less_than": .number(value)])
        }
    }

    private func propertyFilter(_ key: String, _ condition: [String: JSONValue]) -> JSONValue {
        .object(["property": .string(property), key: .object(condition)])
    }

    private func anyOfFilter(key: String) -> JSONValue? {
        guard let names = optionValues, !names.isEmpty else { return nil }
        if names.count == 1 {
            return propertyFilter(key, ["equals": .string(names[0])])
        }
        return .object(["or": .array(names.map { propertyFilter(key, ["equals": .string($0)]) })])
    }

    /// Notion date-only strings are local calendar days, so "today" is the user's local day
    /// (the calendar's time zone), never the UTC day.
    private static func isoDate(_ date: Date, _ calendar: Calendar) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }
}

/// One sort in a pinned database view, in priority order (earlier entries sort first, matching
/// the Notion API's multi-sort array).
public struct ViewSort: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var property: String
    public var ascending: Bool

    public init(id: String = UUID().uuidString, property: String, ascending: Bool) {
        self.id = id
        self.property = property
        self.ascending = ascending
    }
}

/// Combines a saved view's filters/sorts into the JSON bodies `queryDataSource` sends.
public enum ViewQueryBuilder {
    /// AND-combines every filter with a JSON shape (skipping any missing a required value).
    /// Returns `nil` if there is nothing to filter by.
    public static func filterJSON(_ filters: [ViewFilter], referenceDate: Date = Date(), calendar: Calendar = .current) -> JSONValue? {
        let parts = filters.compactMap { $0.requestJSON(referenceDate: referenceDate, calendar: calendar) }
        guard !parts.isEmpty else { return nil }
        if parts.count == 1 { return parts[0] }
        return .object(["and": .array(parts)])
    }

    public static func sortsJSON(_ sorts: [ViewSort]) -> JSONValue? {
        guard !sorts.isEmpty else { return nil }
        return .array(sorts.map { .object(["property": .string($0.property), "direction": .string($0.ascending ? "ascending" : "descending")]) })
    }
}
