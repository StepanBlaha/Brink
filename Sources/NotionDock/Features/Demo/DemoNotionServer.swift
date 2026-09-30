import Foundation

/// An in-process, in-memory Notion (the idea of `Tests/NotionKitTests/FakeNotionServer`) behind
/// a URLProtocol, seeded from `DemoContent`. Demo mode's `NotionClient` uses `session`, so no
/// request ever leaves the Mac and no real token is involved.
final class DemoNotionServer: URLProtocol, @unchecked Sendable {
    static let lock = NSLock()
    nonisolated(unsafe) static var blocks: [String: [String: Any]] = [:]
    nonisolated(unsafe) static var children: [String: [String]] = [:]
    nonisolated(unsafe) static var rows: [String: [String: Any]] = [:]
    nonisolated(unsafe) static var rowOrder: [String] = []
    nonisolated(unsafe) static var nextID = 1
    nonisolated(unsafe) static var seeded = false

    static var session: URLSession {
        seedIfNeeded()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [DemoNotionServer.self]
        return URLSession(configuration: config)
    }

    // MARK: - Seeding

    private static func seedIfNeeded() {
        lock.lock(); defer { lock.unlock() }
        guard !seeded else { return }
        seeded = true
        for (pageID, page) in DemoContent.pages { seed(parent: pageID, page.blocks) }
        for (index, row) in DemoContent.sprintRows.enumerated() {
            let id = "demo-row-\(index + 1)"
            var props: [String: Any] = [
                "Name": ["id": "title", "type": "title", "title": richText(row.0)],
                "Status": ["id": "st", "type": "status", "status": ["name": row.1]],
                "Done": ["id": "dn", "type": "checkbox", "checkbox": row.3],
            ]
            let due: Any = row.2.map { ["start": DemoContent.dayString(offset: $0)] as Any } ?? NSNull()
            props["Due"] = ["id": "du", "type": "date", "date": due]
            rows[id] = ["object": "page", "id": id, "url": "https://example.com/\(id)", "icon": NSNull(), "properties": props]
            rowOrder.append(id)
        }
    }

    private static func seed(parent: String, _ items: [DemoContent.B]) {
        for item in items {
            let id = "demo-block-\(nextID)"
            nextID += 1
            var box = item.extra
            box["rich_text"] = item.text.isEmpty ? [] : richText(item.text)
            blocks[id] = ["object": "block", "id": id, "type": item.type, item.type: box]
            children[parent, default: []].append(id)
            if !item.children.isEmpty { seed(parent: id, item.children) }
        }
    }

    private static func richText(_ text: String) -> [[String: Any]] {
        [["type": "text", "text": ["content": text], "plain_text": text,
          "annotations": ["bold": false, "italic": false, "strikethrough": false, "underline": false, "code": false, "color": "default"]]]
    }

    /// A realistic mix for the add-a-pin search: emoji pages, a database, long titles, one with no icon.
    private static func searchResults(query: String) -> [[String: Any]] {
        func page(_ id: String, _ emoji: String?, _ title: String) -> [String: Any] {
            ["object": "page", "id": id, "url": "https://example.com/\(id)",
             "icon": emoji.map { ["type": "emoji", "emoji": $0] as [String: Any] } ?? NSNull(),
             "properties": ["Name": ["id": "title", "type": "title", "title": richText(title)]]]
        }
        let all: [[String: Any]] = [
            page(DemoContent.groceriesPage, "\u{1F6D2}", "Groceries"),
            page(DemoContent.launchPage, "\u{1F680}", "Launch plan"),
            ["object": "data_source", "id": DemoContent.sprintDataSource, "url": "https://example.com/sprint",
             "icon": ["type": "emoji", "emoji": "\u{1F3C3}"], "title": richText("Sprint")],
            page(DemoContent.readingPage, "\u{1F4DA}", "Reading"),
            page("demo-page-long", "\u{1F4DD}", "Q4 planning notes and a very long title that keeps going past the edge of the panel"),
            page("demo-page-noicon", nil, "Meeting notes"),
            page("demo-page-trip", "\u{2708}\u{FE0F}", "Trip to Lisbon"),
            ["object": "data_source", "id": "demo-ds-tasks", "url": "https://example.com/tasks",
             "icon": NSNull(), "title": richText("Personal tasks")],
        ]
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return all }
        return all.filter { item in
            let title = (item["properties"] as? [String: Any]).flatMap { ($0["Name"] as? [String: Any])?["title"] as? [[String: Any]] }
                ?? item["title"] as? [[String: Any]] ?? []
            return title.compactMap { $0["plain_text"] as? String }.joined().lowercased().contains(q)
        }
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
        Self.record(method: method, path: path, body: json)
        let (status, response) = path.hasPrefix("/v1/file_uploads")
            ? Self.handleUploads(id: path.split(separator: "/").dropFirst(2).first.map(String.init) ?? "",
                                 sub: path.split(separator: "/").dropFirst(3).first.map(String.init) ?? "", body: json, raw: bodyData)
            : Self.handle(method: method, path: path, body: json)
        Self.lock.unlock()

        let data = (try? JSONSerialization.data(withJSONObject: response)) ?? Data()
        let http = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    /// Called with `lock` held.
    private static func handle(method: String, path: String, body: [String: Any]?) -> (Int, Any) {
        let parts = path.split(separator: "/").map(String.init) // ["v1", resource, id, sub]
        guard parts.count >= 2, parts[0] == "v1" else { return notFound() }
        let id = parts.count > 2 ? parts[2] : ""
        let sub = parts.count > 3 ? parts[3] : ""
        switch (parts[1], method) {
        case ("search", "POST"):
            return (200, list(searchResults(query: body?["query"] as? String ?? "")))
        case ("pages", "GET"):
            if let row = rows[id] { return (200, row) }
            guard let page = DemoContent.pages[id] else { return notFound() }
            return (200, ["object": "page", "id": id, "cover": NSNull(), "icon": ["type": "emoji", "emoji": page.emoji]])
        case ("pages", "PATCH"):
            guard var row = rows[id] else { return notFound() }
            var props = row["properties"] as? [String: Any] ?? [:]
            for (name, value) in body?["properties"] as? [String: Any] ?? [:] {
                props[name] = normalizeProperty(value, existing: props[name])
            }
            row["properties"] = props
            rows[id] = row
            return (200, row)
        case ("pages", "POST"):
            let newID = "demo-row-new-\(nextID)"
            nextID += 1
            var props: [String: Any] = ["Done": ["id": "dn", "type": "checkbox", "checkbox": false],
                                        "Status": ["id": "st", "type": "status", "status": ["name": "Not started"]],
                                        "Due": ["id": "du", "type": "date", "date": NSNull()]]
            for (name, value) in body?["properties"] as? [String: Any] ?? [:] {
                props[name] = normalizeProperty(value, existing: props[name])
            }
            let row: [String: Any] = ["object": "page", "id": newID, "url": "https://example.com/\(newID)", "icon": NSNull(), "properties": props]
            rows[newID] = row
            rowOrder.append(newID)
            return (200, row)
        case ("databases", "GET"):
            return (200, ["object": "database", "id": id, "data_sources": [["id": DemoContent.sprintDataSource, "name": "Sprint"]]])
        case ("data_sources", "GET"):
            return (200, sprintSchema(id: id))
        case ("data_sources", "POST") where sub == "query":
            let filter = body?["filter"] as? [String: Any]
            let matching = rowOrder.compactMap { rows[$0] }.filter { filter == nil || matches($0, filter!) }
            return (200, list(matching.sorted { dueKey($0) < dueKey($1) }))
        case ("blocks", _):
            return handleBlocks(method: method, id: id, isChildren: sub == "children", body: body)
        default:
            return notFound()
        }
    }

    private static func sprintSchema(id: String) -> [String: Any] {
        [
            "object": "data_source", "id": id, "name": "Sprint",
            "title": richText("Sprint"),
            "properties": [
                "Name": ["id": "title", "name": "Name", "type": "title", "title": [:]],
                "Status": ["id": "st", "name": "Status", "type": "status",
                           "status": ["options": DemoContent.statusOptions,
                                      "groups": [["name": "To-do", "option_ids": ["st-1"]], ["name": "In progress", "option_ids": ["st-2"]],
                                                 ["name": "Complete", "option_ids": ["st-3"]]]]],
                "Due": ["id": "du", "name": "Due", "type": "date", "date": [:]],
                "Done": ["id": "dn", "name": "Done", "type": "checkbox", "checkbox": [:]],
            ],
        ]
    }
}
