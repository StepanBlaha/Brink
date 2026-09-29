import Testing
import Foundation
@testable import NotionKit

@Suite("ViewFilter / ViewSort JSON")
struct ViewFilterTests {
    /// Fixed reference date so date-relative filters produce deterministic ISO strings.
    private static let referenceDate: Date = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        var components = DateComponents()
        components.year = 2026
        components.month = 9
        components.day = 28
        return calendar.date(from: components)!
    }()

    private func encodeToDictionary(_ value: JSONValue) throws -> [String: Any] {
        let data = try JSONEncoder().encode(value)
        return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    @Test("checkbox is / isn't")
    func checkboxFilters() throws {
        let isFilter = ViewFilter(property: "Done", op: .checkboxIs)
        let json = try encodeToDictionary(#require(isFilter.requestJSON()))
        #expect(json["property"] as? String == "Done")
        #expect((json["checkbox"] as? [String: Any])?["equals"] as? Bool == true)

        let isNotFilter = ViewFilter(property: "Done", op: .checkboxIsNot)
        let jsonNot = try encodeToDictionary(#require(isNotFilter.requestJSON()))
        #expect((jsonNot["checkbox"] as? [String: Any])?["equals"] as? Bool == false)
    }

    @Test("status is / is not / any of")
    func statusFilters() throws {
        let isFilter = ViewFilter(property: "Status", op: .statusIs, optionValues: ["Done"])
        let json = try encodeToDictionary(#require(isFilter.requestJSON()))
        #expect((json["status"] as? [String: Any])?["equals"] as? String == "Done")

        let isNotFilter = ViewFilter(property: "Status", op: .statusIsNot, optionValues: ["Done"])
        let jsonNot = try encodeToDictionary(#require(isNotFilter.requestJSON()))
        #expect((jsonNot["status"] as? [String: Any])?["does_not_equal"] as? String == "Done")

        let anyOfSingle = ViewFilter(property: "Status", op: .statusIsAnyOf, optionValues: ["Done"])
        let jsonAnyOfSingle = try encodeToDictionary(#require(anyOfSingle.requestJSON()))
        #expect((jsonAnyOfSingle["status"] as? [String: Any])?["equals"] as? String == "Done")

        let anyOf = ViewFilter(property: "Status", op: .statusIsAnyOf, optionValues: ["Done", "In progress"])
        let jsonAnyOf = try encodeToDictionary(#require(anyOf.requestJSON()))
        let orParts = try #require(jsonAnyOf["or"] as? [[String: Any]])
        #expect(orParts.count == 2)
        #expect(orParts[0]["property"] as? String == "Status")
        #expect((orParts[0]["status"] as? [String: Any])?["equals"] as? String == "Done")
        #expect((orParts[1]["status"] as? [String: Any])?["equals"] as? String == "In progress")

        #expect(ViewFilter(property: "Status", op: .statusIsAnyOf, optionValues: []).requestJSON() == nil)
    }

    @Test("select is / is not / any of use the select key")
    func selectFilters() throws {
        let isFilter = ViewFilter(property: "Priority", op: .selectIs, optionValues: ["High"])
        let json = try encodeToDictionary(#require(isFilter.requestJSON()))
        #expect((json["select"] as? [String: Any])?["equals"] as? String == "High")

        let isNotFilter = ViewFilter(property: "Priority", op: .selectIsNot, optionValues: ["High"])
        let jsonNot = try encodeToDictionary(#require(isNotFilter.requestJSON()))
        #expect((jsonNot["select"] as? [String: Any])?["does_not_equal"] as? String == "High")
    }

    @Test("date is today / is before today / is empty use documented operator keys")
    func dateFiltersSimple() throws {
        let today = ViewFilter(property: "Due", op: .dateIsToday)
        let jsonToday = try encodeToDictionary(#require(today.requestJSON(referenceDate: Self.referenceDate)))
        #expect((jsonToday["date"] as? [String: Any])?["equals"] as? String == "2026-09-28")

        let before = ViewFilter(property: "Due", op: .dateIsBeforeToday)
        let jsonBefore = try encodeToDictionary(#require(before.requestJSON(referenceDate: Self.referenceDate)))
        #expect((jsonBefore["date"] as? [String: Any])?["before"] as? String == "2026-09-28")

        let empty = ViewFilter(property: "Due", op: .dateIsEmpty)
        let jsonEmpty = try encodeToDictionary(#require(empty.requestJSON()))
        #expect((jsonEmpty["date"] as? [String: Any])?["is_empty"] as? Bool == true)
    }

    @Test("date is within next 7 days compounds on_or_after / on_or_before with AND")
    func dateWithinNext7Days() throws {
        let filter = ViewFilter(property: "Due", op: .dateWithinNext7Days)
        let json = try encodeToDictionary(#require(filter.requestJSON(referenceDate: Self.referenceDate)))
        let andParts = try #require(json["and"] as? [[String: Any]])
        #expect(andParts.count == 2)
        #expect((andParts[0]["date"] as? [String: Any])?["on_or_after"] as? String == "2026-09-28")
        #expect((andParts[1]["date"] as? [String: Any])?["on_or_before"] as? String == "2026-10-05")
    }

    @Test("title contains, skipped when empty")
    func titleContains() throws {
        let filter = ViewFilter(property: "Name", op: .titleContains, textValue: "urgent")
        let json = try encodeToDictionary(#require(filter.requestJSON()))
        #expect((json["title"] as? [String: Any])?["contains"] as? String == "urgent")

        #expect(ViewFilter(property: "Name", op: .titleContains, textValue: "").requestJSON() == nil)
        #expect(ViewFilter(property: "Name", op: .titleContains, textValue: nil).requestJSON() == nil)
    }

    @Test("number greater than / less than")
    func numberFilters() throws {
        let greater = ViewFilter(property: "Score", op: .numberGreaterThan, numberValue: 5)
        let jsonGreater = try encodeToDictionary(#require(greater.requestJSON()))
        #expect((jsonGreater["number"] as? [String: Any])?["greater_than"] as? Double == 5)

        let less = ViewFilter(property: "Score", op: .numberLessThan, numberValue: 10)
        let jsonLess = try encodeToDictionary(#require(less.requestJSON()))
        #expect((jsonLess["number"] as? [String: Any])?["less_than"] as? Double == 10)

        #expect(ViewFilter(property: "Score", op: .numberGreaterThan, numberValue: nil).requestJSON() == nil)
    }

    @Test("ViewQueryBuilder AND-combines multiple filters, passes a single filter through unwrapped")
    func combinedFilters() throws {
        let checkbox = ViewFilter(property: "Done", op: .checkboxIsNot)
        let number = ViewFilter(property: "Score", op: .numberGreaterThan, numberValue: 3)

        let single = try encodeToDictionary(#require(ViewQueryBuilder.filterJSON([checkbox])))
        #expect(single["and"] == nil, "a single filter must not be wrapped in an unnecessary AND")

        let combined = try encodeToDictionary(#require(ViewQueryBuilder.filterJSON([checkbox, number])))
        let andParts = try #require(combined["and"] as? [[String: Any]])
        #expect(andParts.count == 2)

        #expect(ViewQueryBuilder.filterJSON([]) == nil)
        // A filter missing its required value is dropped; if that leaves nothing, result is nil.
        let onlyInvalid = ViewFilter(property: "Name", op: .titleContains, textValue: nil)
        #expect(ViewQueryBuilder.filterJSON([onlyInvalid]) == nil)
    }

    @Test("sorts JSON: property + direction, in given order")
    func sortsJSON() throws {
        let sorts = [
            ViewSort(property: "Priority", ascending: false),
            ViewSort(property: "Due", ascending: true),
        ]
        let json = try #require(ViewQueryBuilder.sortsJSON(sorts))
        let data = try JSONEncoder().encode(json)
        let array = try #require(try JSONSerialization.jsonObject(with: data) as? [[String: Any]])
        #expect(array.count == 2)
        #expect(array[0]["property"] as? String == "Priority")
        #expect(array[0]["direction"] as? String == "descending")
        #expect(array[1]["property"] as? String == "Due")
        #expect(array[1]["direction"] as? String == "ascending")

        #expect(ViewQueryBuilder.sortsJSON([]) == nil)
    }
}
