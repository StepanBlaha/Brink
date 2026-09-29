import Foundation

/// File uploads (create → send → attach as an image block), a request log and a tree dump,
/// for probing the editor's image and move paths. Uploaded bytes are written to the demo's
/// temporary folder and served back as `file://` URLs, so nothing leaves the Mac.
extension DemoNotionServer {
    nonisolated(unsafe) static var opLog: [String] = []
    nonisolated(unsafe) static var uploads: [String: (filename: String, status: String, file: URL?)] = [:]

    static var uploadDirectory: URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("BrinkDemo-\(ProcessInfo.processInfo.processIdentifier)", isDirectory: true).appendingPathComponent("uploads", isDirectory: true)
    }

    /// Called with `lock` held.
    static func record(method: String, path: String, body: [String: Any]?) {
        var line = "\(method) \(path)"
        if let body, let data = try? JSONSerialization.data(withJSONObject: body, options: [.sortedKeys]),
           let text = String(data: data, encoding: .utf8) {
            line += " " + (text.count > 600 ? String(text.prefix(600)) + "…" : text)
        }
        opLog.append(line)
    }

    static func drainLog() -> String {
        lock.lock(); defer { lock.unlock() }
        let out = opLog.joined(separator: "\n")
        opLog.removeAll()
        return out.isEmpty ? "(no requests)" : out
    }

    /// The page's block tree as indented `type: text` lines.
    static func dumpTree(parent: String) -> String {
        lock.lock(); defer { lock.unlock() }
        var lines: [String] = []
        func walk(_ id: String, _ depth: Int) {
            for child in children[id] ?? [] {
                guard let block = blocks[child], let type = block["type"] as? String else { continue }
                let box = block[type] as? [String: Any] ?? [:]
                let text = (box["rich_text"] as? [[String: Any]] ?? []).compactMap { $0["plain_text"] as? String }.joined()
                var extra = ""
                if type == "to_do" { extra = (box["checked"] as? Bool ?? false) ? " [x]" : " [ ]" }
                if type == "image" { extra = " " + (box["type"] as? String ?? "?") }
                lines.append(String(repeating: "  ", count: depth) + "\(type)\(extra): \(text) (\(child))")
                walk(child, depth + 1)
            }
        }
        walk(parent, 0)
        return lines.joined(separator: "\n")
    }

    /// `POST /v1/file_uploads` and `POST /v1/file_uploads/{id}/send`. Called with `lock` held.
    static func handleUploads(id: String, sub: String, body: [String: Any]?, raw: Data?) -> (Int, Any) {
        if id.isEmpty {
            let newID = "demo-upload-\(nextID)"
            nextID += 1
            let filename = body?["filename"] as? String ?? "image.png"
            uploads[newID] = (filename, "pending", nil)
            return (200, uploadObject(newID))
        }
        guard sub == "send", var upload = uploads[id] else { return notFound() }
        try? FileManager.default.createDirectory(at: uploadDirectory, withIntermediateDirectories: true)
        let ext = (upload.filename as NSString).pathExtension.isEmpty ? "png" : (upload.filename as NSString).pathExtension
        let file = uploadDirectory.appendingPathComponent("\(id).\(ext)")
        if let bytes = raw.flatMap(multipartFile) { try? bytes.write(to: file) }
        upload.status = "uploaded"
        upload.file = file
        uploads[id] = upload
        return (200, uploadObject(id))
    }

    private static func uploadObject(_ id: String) -> [String: Any] {
        let upload = uploads[id]
        return ["object": "file_upload", "id": id, "status": upload?.status ?? "pending",
                "filename": upload?.filename ?? "", "content_type": "image/png", "upload_url": "https://example.invalid/upload/\(id)"]
    }

    /// The bytes of the first part of a multipart/form-data body.
    private static func multipartFile(_ raw: Data) -> Data? {
        guard let headerEnd = raw.range(of: Data("\r\n\r\n".utf8)),
              let closing = raw.range(of: Data("\r\n--".utf8), options: .backwards) , closing.lowerBound > headerEnd.upperBound else { return nil }
        return raw.subdata(in: headerEnd.upperBound..<closing.lowerBound)
    }

    /// An appended `image` block from a file upload becomes a Notion-hosted `file` image.
    static func attachUpload(_ box: [String: Any]) -> [String: Any] {
        guard box["type"] as? String == "file_upload", let id = (box["file_upload"] as? [String: Any])?["id"] as? String,
              let file = uploads[id]?.file else { return box }
        return ["type": "file", "file": ["url": file.absoluteString, "expiry_time": "2099-01-01T00:00:00.000Z"], "caption": []]
    }
}
