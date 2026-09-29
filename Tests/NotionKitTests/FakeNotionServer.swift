import Foundation

/// A tiny in-memory Notion (blocks + children) behind a URLProtocol, recording every request.
/// Implements just what the page editor uses: GET children, PATCH block, PATCH children (append
/// with `position`), DELETE block — so a refetch after a sync shows what really got saved.
final class FakeNotionServer: URLProtocol, @unchecked Sendable {
    struct Request: Equatable, CustomStringConvertible {
        let method: String
        let path: String
        let body: [String: AnyHashable]?
        var rawBody: Data? = nil
        var contentType: String? = nil
        var description: String { "\(method) \(path)" }
    }

    private static let lock = NSLock()
    nonisolated(unsafe) private static var blocks: [String: [String: Any]] = [:]
    nonisolated(unsafe) private static var children: [String: [String]] = [:]
    nonisolated(unsafe) private static var nextID = 1
    nonisolated(unsafe) private static var log: [Request] = []
    nonisolated(unsafe) private static var failWrites = 0
    nonisolated(unsafe) private static var pages: [String: [String: Any]] = [:]
    /// File uploads: id → status ("pending" / "uploaded" / "attached").
    nonisolated(unsafe) private static var uploads: [String: String] = [:]

    static var session: URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [FakeNotionServer.self]
        return URLSession(configuration: config)
    }

    // MARK: - Seeding & inspection

    static func reset() {
        lock.lock(); defer { lock.unlock() }
        blocks = [:]; children = [:]; nextID = 1; log = []; failWrites = 0; pages = [:]; uploads = [:]
    }

    /// Serves `GET /v1/pages/{id}` with this page object.
    static func seedPage(_ id: String, json: [String: Any]) {
        lock.lock(); defer { lock.unlock() }
        pages[id] = json
    }

    /// The next `count` non-GET requests fail at the network level (a transient error).
    static func failNextWrites(_ count: Int) {
        lock.lock(); defer { lock.unlock() }
        failWrites = count
    }

    /// Simulates someone editing a block's text in Notion.
    static func remoteEdit(_ id: String, text: String) {
        lock.lock(); defer { lock.unlock() }
        guard var block = blocks[id], let type = block["type"] as? String else { return }
        var box = block[type] as? [String: Any] ?? [:]
        box["rich_text"] = [["type": "text", "text": ["content": text], "plain_text": text]]
        block[type] = box
        blocks[id] = block
    }

    static func seed(parent: String, _ items: [(id: String, type: String, text: String?, extra: [String: Any])]) {
        lock.lock(); defer { lock.unlock() }
        for item in items {
            var box: [String: Any] = item.extra
            if let text = item.text {
                box["rich_text"] = text.isEmpty ? [] : [["type": "text", "text": ["content": text], "plain_text": text]]
            }
            blocks[item.id] = ["object": "block", "id": item.id, "type": item.type, item.type: box]
            children[parent, default: []].append(item.id)
        }
    }

    /// Requests other than reads, in order.
    static var writes: [Request] {
        lock.lock(); defer { lock.unlock() }
        return log.filter { $0.method != "GET" }
    }

    static func clearLog() {
        lock.lock(); defer { lock.unlock() }
        log = []
    }

    static func childIDs(of parent: String) -> [String] {
        lock.lock(); defer { lock.unlock() }
        return children[parent] ?? []
    }

    static func plainText(of id: String) -> String? {
        lock.lock(); defer { lock.unlock() }
        guard let block = blocks[id], let type = block["type"] as? String, let box = block[type] as? [String: Any],
              let rich = box["rich_text"] as? [[String: Any]] else { return nil }
        return rich.compactMap { $0["plain_text"] as? String }.joined()
    }

    // MARK: - URLProtocol

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        let method = request.httpMethod ?? "GET"
        let path = request.url?.path ?? ""
        var bodyData = request.httpBody
        if bodyData == nil, let stream = request.httpBodyStream {
            stream.open()
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let read = stream.read(&buffer, maxLength: buffer.count)
                if read <= 0 { break }
                data.append(buffer, count: read)
            }
            stream.close()
            bodyData = data
        }
        let json = bodyData.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]

        Self.lock.lock()
        if method != "GET", Self.failWrites > 0 {
            Self.failWrites -= 1
            Self.lock.unlock()
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }
        let contentType = request.value(forHTTPHeaderField: "Content-Type")
        Self.log.append(Request(method: method, path: path, body: json.map(Self.hashable) as? [String: AnyHashable],
                                rawBody: json == nil ? bodyData : nil, contentType: contentType))
        let (status, response) = path.hasPrefix("/v1/file_uploads")
            ? Self.handleUpload(method: method, path: path, body: json, raw: bodyData, contentType: contentType)
            : Self.handle(method: method, path: path, body: json)
        Self.lock.unlock()

        let data = (try? JSONSerialization.data(withJSONObject: response)) ?? Data()
        let http = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    private static func hashable(_ value: Any) -> AnyHashable {
        switch value {
        case let dict as [String: Any]: return dict.mapValues(hashable) as [String: AnyHashable]
        case let array as [Any]: return array.map(hashable) as [AnyHashable]
        case let number as NSNumber: return number
        case let string as String: return string
        default: return String(describing: value)
        }
    }

    /// Called with `lock` held.
    private static func handle(method: String, path: String, body: [String: Any]?) -> (Int, Any) {
        let parts = path.split(separator: "/").map(String.init) // ["v1", "blocks", id, ("children")]
        if parts.count == 3, parts[1] == "pages", method == "GET" {
            return pages[parts[2]].map { (200, $0) } ?? notFound()
        }
        guard parts.count >= 3, parts[0] == "v1", parts[1] == "blocks" else { return notFound() }
        let id = parts[2]
        let isChildren = parts.count == 4 && parts[3] == "children"

        switch (method, isChildren) {
        case ("GET", true):
            let results = (children[id] ?? []).compactMap(render)
            return (200, ["object": "list", "results": results, "next_cursor": NSNull(), "has_more": false])

        case ("PATCH", true):
            guard id.hasPrefix("page") || blocks[id] != nil else { return notFound() }
            var list = children[id] ?? []
            var index = list.count
            if let position = body?["position"] as? [String: Any] {
                switch position["type"] as? String {
                case "start": index = 0
                case "after_block":
                    let after = (position["after_block"] as? [String: Any])?["id"] as? String
                    guard let after, let i = list.firstIndex(of: after) else {
                        return (400, ["object": "error", "code": "validation_error", "message": "after_block is not a child of the parent"])
                    }
                    index = i + 1
                default: break
                }
            }
            var created: [[String: Any]] = []
            for child in body?["children"] as? [[String: Any]] ?? [] {
                let newID = "new-\(nextID)"
                nextID += 1
                let type = child["type"] as? String ?? "paragraph"
                var box = child[type] as? [String: Any] ?? [:]
                if type == "image" {
                    // Notion turns an attached upload into its own hosted file.
                    if box["type"] as? String == "file_upload" {
                        let uploadID = (box["file_upload"] as? [String: Any])?["id"] as? String ?? ""
                        guard uploads[uploadID] == "uploaded" else {
                            return (400, ["object": "error", "code": "validation_error", "message": "file upload \(uploadID) is not uploaded"])
                        }
                        uploads[uploadID] = "attached"
                        box = ["type": "file", "caption": [], "file": ["url": "https://files.example/\(uploadID).png?X-Amz-Signature=abc", "expiry_time": "2030-01-01T00:00:00.000Z"]]
                    }
                } else {
                    box["rich_text"] = responseRichText(box["rich_text"])
                }
                blocks[newID] = ["object": "block", "id": newID, "type": type, type: box]
                list.insert(newID, at: index)
                index += 1
                if let rendered = render(newID) { created.append(rendered) }
            }
            children[id] = list
            return (200, ["object": "list", "results": created, "next_cursor": NSNull(), "has_more": false])

        case ("PATCH", false):
            guard var block = blocks[id], let type = block["type"] as? String else { return notFound() }
            if let sentType = body?["type"] as? String, sentType != type {
                return (400, ["object": "error", "code": "validation_error", "message": "type mismatch"])
            }
            var box = block[type] as? [String: Any] ?? [:]
            for (key, value) in body?[type] as? [String: Any] ?? [:] {
                box[key] = key == "rich_text" ? responseRichText(value) : value
            }
            block[type] = box
            blocks[id] = block
            return (200, render(id) ?? [:])

        case ("DELETE", false):
            guard blocks[id] != nil else { return notFound() }
            let rendered = render(id) ?? [:]
            blocks[id] = nil
            for key in children.keys { children[key]?.removeAll { $0 == id } }
            return (200, rendered)

        default:
            return notFound()
        }
    }

    /// `POST /v1/file_uploads` and `POST /v1/file_uploads/{id}/send` (multipart, field `file`).
    private static func handleUpload(method: String, path: String, body: [String: Any]?, raw: Data?, contentType: String?) -> (Int, Any) {
        let parts = path.split(separator: "/").map(String.init) // ["v1", "file_uploads", (id, "send")]
        guard method == "POST" else { return notFound() }
        if parts.count == 2 {
            let id = "fu-\(nextID)"
            nextID += 1
            uploads[id] = "pending"
            return (200, ["object": "file_upload", "id": id, "status": "pending",
                          "filename": body?["filename"] ?? NSNull(), "content_type": body?["content_type"] ?? NSNull(),
                          "upload_url": "https://api.notion.com/v1/file_uploads/\(id)/send"])
        }
        guard parts.count == 4, parts[3] == "send", uploads[parts[2]] == "pending" else { return notFound() }
        guard contentType?.hasPrefix("multipart/form-data; boundary=") == true,
              let raw, let text = String(data: raw, encoding: .isoLatin1), text.contains("name=\"file\"") else {
            return (400, ["object": "error", "code": "validation_error", "message": "expected multipart form-data with a file field"])
        }
        uploads[parts[2]] = "uploaded"
        return (200, ["object": "file_upload", "id": parts[2], "status": "uploaded"])
    }

    private static func render(_ id: String) -> [String: Any]? {
        guard var block = blocks[id] else { return nil }
        block["has_children"] = !(children[id] ?? []).isEmpty
        return block
    }

    private static func responseRichText(_ value: Any?) -> [[String: Any]] {
        (value as? [[String: Any]] ?? []).map { item in
            var out = item
            let content = (item["text"] as? [String: Any])?["content"] as? String ?? ""
            out["plain_text"] = content
            if let link = ((item["text"] as? [String: Any])?["link"] as? [String: Any])?["url"] as? String { out["href"] = link }
            return out
        }
    }

    private static func notFound() -> (Int, Any) {
        (404, ["object": "error", "code": "object_not_found", "message": "Not found"])
    }
}
