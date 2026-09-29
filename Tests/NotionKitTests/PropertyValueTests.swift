import Testing
import Foundation
@testable import NotionKit

@Suite("PropertyValue")
struct PropertyValueTests {
    @Test("round-trips through Codable for every case")
    func roundTrip() throws {
        let values: [PropertyValue] = [
            .title("Hello"),
            .richText("Some notes"),
            .checkbox(true),
            .status(name: "In progress"),
            .status(name: nil),
            .select(name: "High"),
            .date(start: "2026-01-01", end: "2026-01-05"),
            .date(start: nil, end: nil),
            .number(42.5),
            .number(nil),
            .unsupported(type: "relation"),
        ]
        let encoder = JSONEncoder()
        let decoder = JSONDecoder()
        for value in values {
            let data = try encoder.encode(value)
            let decoded = try decoder.decode(PropertyValue.self, from: data)
            #expect(decoded == value)
        }
    }

    @Test("requestJSON builds the update-page-properties shape")
    func requestJSON() throws {
        let checkbox = PropertyValue.checkbox(true).requestJSON
        #expect(checkbox == .object(["type": .string("checkbox"), "checkbox": .bool(true)]))

        let clearedDate = PropertyValue.date(start: nil, end: nil).requestJSON
        #expect(clearedDate == .object(["type": .string("date"), "date": .null]))

        #expect(PropertyValue.unsupported(type: "relation").requestJSON == nil)
    }
}
