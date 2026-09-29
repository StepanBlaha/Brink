import Foundation

extension DemoNotionServer {
    /// Blocks API: GET/PATCH/DELETE a block, GET/PATCH (append with `position`) its children.
    static func handleBlocks(method: String, id: String, isChildren: Bool, body: [String: Any]?) -> (Int, Any) {
        switch (method, isChildren) {
        case ("GET", true):
            return (200, list((children[id] ?? []).compactMap(render)))
        case ("GET", false):
            return render(id).map { (200, $0) } ?? notFound()
        case ("PATCH", true):
            var list = children[id] ?? []
            var index = list.count
            if let position = body?["position"] as? [String: Any] {
                switch position["type"] as? String {
                case "start": index = 0
                case "after_block":
                    let after = (position["after_block"] as? [String: Any])?["id"] as? String
                    if let after, let i = list.firstIndex(of: after) { index = i + 1 }
                default: break
                }
            }
            var created: [[String: Any]] = []
            for child in body?["children"] as? [[String: Any]] ?? [] {
                let newID = "demo-new-\(nextID)"
                nextID += 1
                let type = child["type"] as? String ?? "paragraph"
                var box = child[type] as? [String: Any] ?? [:]
                if box["rich_text"] != nil { box["rich_text"] = responseRichText(box["rich_text"]) }
                blocks[newID] = ["object": "block", "id": newID, "type": type, type: box]
                list.insert(newID, at: min(index, list.count))
                index += 1
                if let nested = box["children"] as? [[String: Any]], !nested.isEmpty {
                    children[newID] = []
                    _ = handleBlocks(method: "PATCH", id: newID, isChildren: true, body: ["children": nested])
                }
                if let rendered = render(newID) { created.append(rendered) }
            }
            children[id] = list
            return (200, self.list(created))
        case ("PATCH", false):
            guard var block = blocks[id], let type = block["type"] as? String else { return notFound() }
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

    static func render(_ id: String) -> [String: Any]? {
        guard var block = blocks[id] else { return nil }
        block["has_children"] = !(children[id] ?? []).isEmpty
        return block
    }

    /// Request rich text (`text.content`) → response rich text (adds `plain_text`, `href`).
    static func responseRichText(_ value: Any?) -> [[String: Any]] {
        (value as? [[String: Any]] ?? []).map { item in
            var out = item
            let text = item["text"] as? [String: Any]
            out["plain_text"] = text?["content"] as? String ?? item["plain_text"] as? String ?? ""
            if let link = (text?["link"] as? [String: Any])?["url"] as? String { out["href"] = link }
            return out
        }
    }

    /// A property from a request body, in the shape a page object returns.
    static func normalizeProperty(_ value: Any, existing: Any?) -> Any {
        guard var prop = value as? [String: Any] else { return value }
        let old = existing as? [String: Any]
        let type = prop["type"] as? String ?? old?["type"] as? String
            ?? prop.keys.first { ["title", "rich_text", "checkbox", "status", "date", "select", "number"].contains($0) } ?? "rich_text"
        prop["type"] = type
        prop["id"] = old?["id"] ?? type
        if type == "title" || type == "rich_text" { prop[type] = responseRichText(prop[type]) }
        return prop
    }

    /// Enough of Notion's filter language for the demo: and/or, checkbox and status/select equals.
    static func matches(_ row: [String: Any], _ filter: [String: Any]) -> Bool {
        if let all = filter["and"] as? [[String: Any]] { return all.allSatisfy { matches(row, $0) } }
        if let any = filter["or"] as? [[String: Any]] { return any.contains { matches(row, $0) } }
        guard let name = filter["property"] as? String,
              let prop = (row["properties"] as? [String: Any])?[name] as? [String: Any] else { return true }
        if let condition = filter["checkbox"] as? [String: Any], let equals = condition["equals"] as? Bool {
            return (prop["checkbox"] as? Bool ?? false) == equals
        }
        for kind in ["status", "select"] {
            guard let condition = filter[kind] as? [String: Any] else { continue }
            let current = (prop[kind] as? [String: Any])?["name"] as? String
            if let equals = condition["equals"] as? String { return current == equals }
            if let notEquals = condition["does_not_equal"] as? String { return current != notEquals }
        }
        return true
    }

    static func dueKey(_ row: [String: Any]) -> String {
        let due = ((row["properties"] as? [String: Any])?["Due"] as? [String: Any])?["date"] as? [String: Any]
        return due?["start"] as? String ?? "9999"
    }

    static func list(_ results: [[String: Any]]) -> [String: Any] {
        ["object": "list", "results": results, "next_cursor": NSNull(), "has_more": false]
    }

    static func notFound() -> (Int, Any) {
        (404, ["object": "error", "code": "object_not_found", "message": "Not found"])
    }
}
