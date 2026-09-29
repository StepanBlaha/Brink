import Testing
import Foundation
@testable import NotionKit

@Suite("Decoding")
struct DecodingTests {
    @Test("search results decode pages and data sources")
    func searchResults() throws {
        struct Wrapper: Decodable { let results: [SearchResult] }
        let data = Data(SearchFixtures.searchResponse.utf8)
        let wrapper = try JSONDecoder().decode(Wrapper.self, from: data)
        #expect(wrapper.results.count == 2)

        let page = wrapper.results[0]
        #expect(page.kind == .page)
        #expect(page.title == "My Task List")
        #expect(page.icon == .emoji("📝"))

        let dataSource = wrapper.results[1]
        #expect(dataSource.kind == .dataSource)
        #expect(dataSource.title == "Tasks")
        if case .external(let url) = dataSource.icon {
            #expect(url.absoluteString == "https://example.com/icon.png")
        } else {
            Issue.record("Expected external icon")
        }
    }

    @Test("data source schema decodes properties, select and status options")
    func dataSourceSchema() throws {
        let data = Data(DataSourceFixtures.schemaResponse.utf8)
        let schema = try JSONDecoder().decode(DataSourceSchema.self, from: data)
        #expect(schema.id == "ds-1")
        #expect(schema.name == "Tasks")
        #expect(schema.properties.count == 5)

        let status = try #require(schema.properties.first { $0.name == "Status" })
        #expect(status.type == "status")
        #expect(status.statusOptions?.map(\.name).sorted() == ["Done", "Not started"])

        let priority = try #require(schema.properties.first { $0.name == "Priority" })
        #expect(priority.selectOptions?.map(\.name).sorted() == ["High", "Low"])

        let done = try #require(schema.properties.first { $0.name == "Done" })
        #expect(done.type == "checkbox")
    }

    @Test("status groups infer the done option, falling back to name matching when absent")
    func statusDoneOptionInference() throws {
        // Fixture's "Status" property has empty groups, so it should fall back to matching the
        // option literally named "Done".
        let data = Data(DataSourceFixtures.schemaResponse.utf8)
        let schema = try JSONDecoder().decode(DataSourceSchema.self, from: data)
        let status = try #require(schema.properties.first { $0.name == "Status" })
        #expect(status.doneStatusOptionNames == ["Done"])

        // With an explicit "Complete" group, that group's option(s) win even if named differently.
        let grouped = """
        {
          "id": "grp-ds",
          "name": "Grouped",
          "properties": {
            "Status": {
              "id": "grp",
              "name": "Status",
              "type": "status",
              "status": {
                "options": [
                  { "id": "opt-1", "name": "Backlog", "color": "default" },
                  { "id": "opt-2", "name": "Shipped", "color": "green" }
                ],
                "groups": [
                  { "name": "To-do", "option_ids": ["opt-1"] },
                  { "name": "Complete", "option_ids": ["opt-2"] }
                ]
              }
            }
          }
        }
        """
        let groupedSchema = try JSONDecoder().decode(DataSourceSchema.self, from: Data(grouped.utf8))
        let groupedStatus = try #require(groupedSchema.properties.first { $0.name == "Status" })
        #expect(groupedStatus.doneStatusOptionNames == ["Shipped"])
    }

    @Test("query rows decode title, checkbox, status and date, with pagination cursor")
    func queryRows() throws {
        struct Wrapper: Decodable { let results: [Row]; let nextCursor: String?; let hasMore: Bool
            enum CodingKeys: String, CodingKey { case results, nextCursor = "next_cursor", hasMore = "has_more" }
        }
        let data = Data(DataSourceFixtures.queryResponse.utf8)
        let wrapper = try JSONDecoder().decode(Wrapper.self, from: data)
        #expect(wrapper.hasMore)
        #expect(wrapper.nextCursor == "cursor-2")

        let row = try #require(wrapper.results.first)
        #expect(row.title == "Buy milk")
        #expect(row.properties["Done"] == .checkbox(false))
        #expect(row.properties["Status"] == .status(name: "Not started"))
        #expect(row.properties["Due"] == .date(start: "2026-10-01", end: nil))

        let page2 = try JSONDecoder().decode(Wrapper.self, from: Data(DataSourceFixtures.queryResponsePage2.utf8))
        #expect(page2.hasMore == false)
        let row2 = try #require(page2.results.first)
        #expect(row2.properties["Done"] == .checkbox(true))
        #expect(row2.icon == .emoji("✅"))
    }

    @Test("block children decode known types and mark unsupported ones")
    func blockChildren() throws {
        struct Wrapper: Decodable { let results: [Block] }
        let data = Data(BlockFixtures.childrenResponse.utf8)
        let wrapper = try JSONDecoder().decode(Wrapper.self, from: data)
        #expect(wrapper.results.count == 4)

        #expect(wrapper.results[0].type == .paragraph)
        #expect(wrapper.results[0].plainText == "Hello world")

        if case .toDo(let checked) = wrapper.results[1].type {
            #expect(checked)
        } else {
            Issue.record("Expected to_do block")
        }
        #expect(wrapper.results[1].plainText == "Buy milk")

        #expect(wrapper.results[2].type == .heading1)

        if case .unsupported(let type) = wrapper.results[3].type {
            #expect(type == "embed")
        } else {
            Issue.record("Expected unsupported block")
        }
    }
}
