import Foundation

public struct DataSourceRef: Decodable, Sendable, Equatable {
    public let id: String
    public let name: String
}

public actor NotionClient {
    public static let apiVersion = "2025-09-03"

    private let tokenProvider: @Sendable () -> String?
    /// Called once on a 401 with the token that was rejected; returns true when a fresh token is
    /// available (OAuth refresh), in which case the request is retried a single time.
    private let onUnauthorized: (@Sendable (_ rejectedToken: String) async -> Bool)?
    private let session: URLSession
    private let baseURL = URL(string: "https://api.notion.com/v1")!
    private let rateLimiter = RateLimiter(minSpacing: 0.34)
    /// Per-request timeout, so a hung connection fails (and retries) instead of stalling a save.
    static let requestTimeout: TimeInterval = 30
    /// 429s honor Retry-After and have their own budget; 5xx/network errors back off exponentially.
    static let maxRateLimitRetries = 5
    static let maxServerRetries = 3
    private let backoffBase: TimeInterval
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    public init(tokenProvider: @escaping @Sendable () -> String?,
                session: URLSession = .shared,
                onUnauthorized: (@Sendable (_ rejectedToken: String) async -> Bool)? = nil,
                backoffBase: TimeInterval = 0.5) {
        self.backoffBase = backoffBase
        self.tokenProvider = tokenProvider
        self.session = session
        self.onUnauthorized = onUnauthorized
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
    func performRequest(method: String, path: String, query: [String: String], body: JSONValue?, rawBody: (data: Data, contentType: String)? = nil, rateLimitRetries: Int = 0, serverRetries: Int = 0, didRefresh: Bool = false) async throws -> Data {
        guard let token = tokenProvider(), !token.isEmpty else { throw NotionError.missingToken }

        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        var urlRequest = URLRequest(url: components.url!)
        urlRequest.httpMethod = method
        urlRequest.timeoutInterval = Self.requestTimeout
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue(Self.apiVersion, forHTTPHeaderField: "Notion-Version")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { urlRequest.httpBody = try encoder.encode(body) }
        if let rawBody {
            urlRequest.setValue(rawBody.contentType, forHTTPHeaderField: "Content-Type")
            urlRequest.httpBody = rawBody.data
        }

        await rateLimiter.acquire()

        func retry(rate: Int, server: Int, refreshed: Bool? = nil) async throws -> Data {
            try await performRequest(method: method, path: path, query: query, body: body, rawBody: rawBody,
                                     rateLimitRetries: rate, serverRetries: server, didRefresh: refreshed ?? didRefresh)
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: urlRequest)
        } catch {
            let urlError = error as? URLError
            // A timed-out write may have gone through: only reads are safe to send again.
            let safe = urlError?.code != .timedOut || Self.isIdempotent(method: method, path: path)
            guard urlError?.code != .cancelled, safe, serverRetries < Self.maxServerRetries else {
                throw NotionError.network(error.localizedDescription)
            }
            try? await Task.sleep(nanoseconds: Self.backoffNanos(base: backoffBase, retry: serverRetries))
            return try await retry(rate: rateLimitRetries, server: serverRetries + 1)
        }
        guard let http = response as? HTTPURLResponse else {
            throw NotionError.network("No HTTP response received")
        }

        switch http.statusCode {
        case 200..<300:
            return data
        case 429:
            guard rateLimitRetries < Self.maxRateLimitRetries else { throw NotionError.rateLimited }
            let retryAfter = min(http.value(forHTTPHeaderField: "Retry-After").flatMap(Double.init) ?? 1, 60)
            await rateLimiter.delay(until: Date().addingTimeInterval(retryAfter))
            try? await Task.sleep(nanoseconds: UInt64(retryAfter * 1_000_000_000))
            return try await retry(rate: rateLimitRetries + 1, server: serverRetries)
        case 500..<600:
            guard serverRetries < Self.maxServerRetries else { throw decodeAPIError(data, status: http.statusCode) }
            try? await Task.sleep(nanoseconds: Self.backoffNanos(base: backoffBase, retry: serverRetries))
            return try await retry(rate: rateLimitRetries, server: serverRetries + 1)
        case 401:
            if !didRefresh, let onUnauthorized, await onUnauthorized(token) {
                return try await retry(rate: rateLimitRetries, server: serverRetries, refreshed: true)
            }
            throw NotionError.unauthorized
        case 404:
            throw NotionError.notFound
        default:
            throw decodeAPIError(data, status: http.statusCode)
        }
    }

    /// 0.5 s, 1 s, 2 s for retries 0, 1, 2 (scaled by `base / 0.5`).
    static func backoffNanos(base: TimeInterval, retry: Int) -> UInt64 {
        UInt64(base * pow(2, Double(retry)) * 1_000_000_000)
    }

    static func isIdempotent(method: String, path: String) -> Bool {
        method == "GET" || method == "DELETE" || path == "search" || path.hasSuffix("/query")
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
