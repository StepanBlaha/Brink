import Testing
import Foundation
@testable import NotionKit

@Suite("NotionClient", .serialized)
struct NotionClientTests {
    @Test("retries after 429 honoring Retry-After, then succeeds")
    func retriesAfterRateLimit() async throws {
        MockURLProtocol.reset()
        MockURLProtocol.queue { _ in
            .init(status: 429, headers: ["Retry-After": "1"], body: Data("{\"code\":\"rate_limited\",\"message\":\"slow down\"}".utf8))
        }
        MockURLProtocol.queue { _ in
            .init(status: 200, headers: [:], body: Data(DataSourceFixtures.schemaResponse.utf8))
        }

        let client = NotionClient(tokenProvider: { "test-token" }, session: MockURLProtocol.session)
        let start = Date()
        let schema = try await client.retrieveDataSource("ds-1")
        let elapsed = Date().timeIntervalSince(start)

        #expect(schema.id == "ds-1")
        #expect(elapsed >= 0.9, "Should have waited out the Retry-After before succeeding")
    }

    @Test("gives up after exhausting retries on repeated 429s")
    func exhaustsRetries() async throws {
        MockURLProtocol.reset()
        for _ in 0..<4 {
            MockURLProtocol.queue { _ in
                .init(status: 429, headers: ["Retry-After": "0"], body: Data())
            }
        }
        let client = NotionClient(tokenProvider: { "test-token" }, session: MockURLProtocol.session)
        await #expect(throws: NotionError.rateLimited) {
            _ = try await client.retrieveDataSource("ds-1")
        }
    }

    @Test("spaces consecutive requests by roughly the minimum interval")
    func rateLimiterSpacing() async throws {
        MockURLProtocol.reset()
        for _ in 0..<3 {
            MockURLProtocol.queue { _ in
                .init(status: 200, headers: [:], body: Data(DataSourceFixtures.schemaResponse.utf8))
            }
        }
        let client = NotionClient(tokenProvider: { "test-token" }, session: MockURLProtocol.session)
        _ = try await client.retrieveDataSource("ds-1")
        _ = try await client.retrieveDataSource("ds-1")
        _ = try await client.retrieveDataSource("ds-1")

        let timestamps = MockURLProtocol.timestamps
        #expect(timestamps.count == 3)
        let gap1 = timestamps[1].timeIntervalSince(timestamps[0])
        let gap2 = timestamps[2].timeIntervalSince(timestamps[1])
        #expect(gap1 >= 0.3)
        #expect(gap2 >= 0.3)
    }

    @Test("maps 401 and 404 to typed errors")
    func statusMapping() async throws {
        MockURLProtocol.reset()
        MockURLProtocol.queue { _ in .init(status: 401, headers: [:], body: Data()) }
        let client = NotionClient(tokenProvider: { "test-token" }, session: MockURLProtocol.session)
        await #expect(throws: NotionError.unauthorized) {
            _ = try await client.retrieveDataSource("ds-1")
        }

        MockURLProtocol.reset()
        MockURLProtocol.queue { _ in .init(status: 404, headers: [:], body: Data()) }
        await #expect(throws: NotionError.notFound) {
            _ = try await client.retrieveDataSource("ds-1")
        }
    }

    @Test("missing token throws before any request")
    func missingToken() async throws {
        MockURLProtocol.reset()
        let client = NotionClient(tokenProvider: { nil }, session: MockURLProtocol.session)
        await #expect(throws: NotionError.missingToken) {
            _ = try await client.retrieveDataSource("ds-1")
        }
    }
}
