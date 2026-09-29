import Foundation

public struct DataSourceRef: Decodable, Sendable, Equatable {
    public let id: String
    public let name: String
}

public actor NotionClient {
    public static let apiVersion = "2025-09-03"

    private let tokenProvider: @Sendable () -> String?
    private let session: URLSession
    private let baseURL = URL(string: "https://api.notion.com/v1")!
    private let rateLimiter = RateLimiter(minSpacing: 0.34)
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    public init(tokenProvider: @escaping @Sendable () -> String?, session: URLSession = .shared) {
        self.tokenProvider = tokenProvider
        self.session = session
    }

    // MARK: - Search & pinning

    public func search(query: String? = nil) async throws -> [SearchResult] {
        try await paginate { cursor in
            var body: [String: JSONValue] = [:]
            if let query, !query.isEmpty { body["query"] = .string(query) }
            if let cursor { body["start_cursor"] = .string(cursor) }
            return try await self.request(method: "POST", path: "search", body: .object(body))
        }
    }

    // MARK: - Data sources

    public func retrieveDatabase(_ id: String) async throws -> [DataSourceRef] {
        let response: DatabaseResponse = try await request(method: "GET", path: "databases/\(id)")
        return response.dataSources
    }

    public func retrieveDataSource(_ id: String) async throws -> DataSourceSchema {
        try await request(method: "GET", path: "data_sources/\(id)")
    }

    public func queryDataSource(_ id: String, filter: JSONValue? = nil, sorts: JSONValue? = nil) async throws -> [Row] {
        try await paginate { cursor in
            var body: [String: JSONValue] = [:]
            if let filter { body["filter"] = filter }
            if let sorts { body["sorts"] = sorts }
            if let cursor { body["start_cursor"] = .string(cursor) }
            return try await self.request(method: "POST", path: "data_sources/\(id)/query", body: .object(body))
        }
    }

    @discardableResult
    public func createRow(dataSourceId: String, title: String, extra: [PropertyUpdate] = []) async throws -> Row {
        let schema = try await retrieveDataSource(dataSourceId)
        guard let titleProperty = schema.properties.first(where: { $0.type == "title" }) else {
            throw NotionError.decoding("Data source \(dataSourceId) has no title property")
        }
        var properties: [String: JSONValue] = [
            titleProperty.name: .object(["title": .array(RichText.encode(title))]),
        ]
        for update in extra {
            if let json = update.value.requestJSON { properties[update.name] = json }
        }
        let body: JSONValue = .object([
            "parent": .object(["type": .string("data_source_id"), "data_source_id": .string(dataSourceId)]),
            "properties": .object(properties),
        ])
        return try await request(method: "POST", path: "pages", body: body)
    }

    @discardableResult
    public func updatePageProperties(pageId: String, _ updates: [PropertyUpdate]) async throws -> Row {
        var properties: [String: JSONValue] = [:]
        for update in updates {
            if let json = update.value.requestJSON { properties[update.name] = json }
        }
        return try await request(method: "PATCH", path: "pages/\(pageId)", body: .object(["properties": .object(properties)]))
    }

    // MARK: - Pages

    /// Additive: a page's cover and icon (`GET /v1/pages/{id}`).
    public func retrievePage(_ pageId: String) async throws -> PageMeta {
        try await request(method: "GET", path: "pages/\(pageId)")
    }

    // MARK: - Blocks

    public func blockChildren(_ blockId: String) async throws -> [Block] {
        try await paginate { cursor in
            var query: [String: String] = [:]
            if let cursor { query["start_cursor"] = cursor }
            return try await self.request(method: "GET", path: "blocks/\(blockId)/children", query: query)
        }
    }

    @discardableResult
    public func updateBlock(_ blockId: String, type: String, update: BlockUpdate) async throws -> Block {
        var payload: [String: JSONValue] = ["type": .string(type)]
        switch update {
        case .text(let text):
            payload[type] = .object(["rich_text": .array(RichText.encode(text))])
        case .checked(let checked):
            payload[type] = .object(["checked": .bool(checked)])
        case .richText(let spans):
            payload[type] = .object(["rich_text": .array(RichText.encode(spans: spans))])
        case .content(let spans, let checked, let language):
            var box: [String: JSONValue] = ["rich_text": .array(RichText.encode(spans: spans))]
            if let checked { box["checked"] = .bool(checked) }
            if let language { box["language"] = .string(language) }
            payload[type] = .object(box)
        case .calloutContent(let spans, let emoji):
            var box: [String: JSONValue] = ["rich_text": .array(RichText.encode(spans: spans))]
            if let emoji, !emoji.isEmpty { box["icon"] = .object(["type": .string("emoji"), "emoji": .string(emoji)]) }
            payload[type] = .object(box)
        }
        return try await request(method: "PATCH", path: "blocks/\(blockId)", body: .object(payload))
    }

    /// Appends blocks as children of `parentId`, at `position` (API 2025-09-03's `position` param:
    /// verified against the Notion docs — `after` is deprecated in favor of this).
    @discardableResult
    public func appendBlocks(parentId: String, _ blocks: [NewBlock], position: BlockPosition = .end) async throws -> [Block] {
        var body: [String: JSONValue] = ["children": .array(blocks.map(\.requestJSON))]
        if let positionJSON = position.requestJSON {
            body["position"] = positionJSON
        }
        let response: ListResponse<Block> = try await request(method: "PATCH", path: "blocks/\(parentId)/children", body: .object(body))
        return response.results
    }

    /// Deletes (archives to trash) a block.
    public func deleteBlock(_ blockId: String) async throws {
        _ = try await performRequest(method: "DELETE", path: "blocks/\(blockId)", query: [:], body: nil)
    }

    // MARK: - Pagination

    private func paginate<T: Decodable>(_ fetch: (String?) async throws -> ListResponse<T>) async throws -> [T] {
        var items: [T] = []
        var cursor: String? = nil
        repeat {
            let page = try await fetch(cursor)
            items.append(contentsOf: page.results)
            cursor = page.hasMore ? page.nextCursor : nil
        } while cursor != nil
        return items
    }

    // MARK: - Transport

    // Not `private`: `NotionClient+Icons.swift` (a separate file, added independently to avoid
    // edit conflicts on this file) calls through these to reuse auth/rate-limiting/retry.
    func request<T: Decodable>(method: String, path: String, query: [String: String] = [:], body: JSONValue? = nil) async throws -> T {
        let data = try await performRequest(method: method, path: path, query: query, body: body)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw NotionError.decoding(String(describing: error))
        }
    }

    /// `rawBody` (additive, for multipart file uploads) is sent as is with its own Content-Type
    /// instead of a JSON `body`.
    func performRequest(method: String, path: String, query: [String: String], body: JSONValue?, rawBody: (data: Data, contentType: String)? = nil, attempt: Int = 0) async throws -> Data {
        guard let token = tokenProvider(), !token.isEmpty else { throw NotionError.missingToken }

        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        var urlRequest = URLRequest(url: components.url!)
        urlRequest.httpMethod = method
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue(Self.apiVersion, forHTTPHeaderField: "Notion-Version")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { urlRequest.httpBody = try encoder.encode(body) }
        if let rawBody {
            urlRequest.setValue(rawBody.contentType, forHTTPHeaderField: "Content-Type")
            urlRequest.httpBody = rawBody.data
        }

        await rateLimiter.acquire()

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: urlRequest)
        } catch {
            throw NotionError.network(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw NotionError.network("No HTTP response received")
        }

        switch http.statusCode {
        case 200..<300:
            return data
        case 429:
            guard attempt < 3 else { throw NotionError.rateLimited }
            let retryAfter = http.value(forHTTPHeaderField: "Retry-After").flatMap(Double.init) ?? 1
            await rateLimiter.delay(until: Date().addingTimeInterval(retryAfter))
            try? await Task.sleep(nanoseconds: UInt64(retryAfter * 1_000_000_000))
            return try await performRequest(method: method, path: path, query: query, body: body, rawBody: rawBody, attempt: attempt + 1)
        case 500..<600:
            guard attempt < 1 else { throw decodeAPIError(data, status: http.statusCode) }
            try? await Task.sleep(nanoseconds: 500_000_000)
            return try await performRequest(method: method, path: path, query: query, body: body, rawBody: rawBody, attempt: attempt + 1)
        case 401:
            throw NotionError.unauthorized
        case 404:
            throw NotionError.notFound
        default:
            throw decodeAPIError(data, status: http.statusCode)
        }
    }

    private func decodeAPIError(_ data: Data, status: Int) -> NotionError {
        struct APIErrorBody: Decodable { let code: String?; let message: String? }
        if let errorBody = try? decoder.decode(APIErrorBody.self, from: data) {
            return .api(code: errorBody.code ?? "\(status)", message: errorBody.message ?? "Unknown error")
        }
        return .api(code: "\(status)", message: "HTTP \(status)")
    }
}

struct ListResponse<T: Decodable>: Decodable {
    let results: [T]
    let nextCursor: String?
    let hasMore: Bool

    enum CodingKeys: String, CodingKey {
        case results, nextCursor = "next_cursor", hasMore = "has_more"
    }
}

private struct DatabaseResponse: Decodable {
    let dataSources: [DataSourceRef]
    enum CodingKeys: String, CodingKey { case dataSources = "data_sources" }
}
