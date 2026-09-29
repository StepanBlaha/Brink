import Foundation

/// A Notion File Upload object (`POST /v1/file_uploads`, API 2025-09-03).
public struct FileUploadObject: Decodable, Sendable, Equatable {
    public let id: String
    /// "pending" → "uploaded" (after `send`) → attached; "expired"/"failed" otherwise.
    public let status: String
    public let filename: String?
    public let contentType: String?
    public let uploadURL: String?

    enum CodingKeys: String, CodingKey {
        case id, status, filename, contentType = "content_type", uploadURL = "upload_url"
    }
}

/// A `multipart/form-data` body (RFC 7578) — what `POST /v1/file_uploads/{id}/send` takes, with
/// the bytes under the form field `file`.
public struct MultipartFormData: Sendable {
    public let boundary: String
    private var body = Data()

    public init(boundary: String = "NotionDock-\(UUID().uuidString)") {
        self.boundary = boundary
    }

    /// The request's Content-Type header value.
    public var contentType: String { "multipart/form-data; boundary=\(boundary)" }

    public mutating func addField(name: String, value: String) {
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"\(Self.escape(name))\"\r\n\r\n")
        append(value)
        append("\r\n")
    }

    public mutating func addFile(name: String, filename: String, contentType: String, data: Data) {
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"\(Self.escape(name))\"; filename=\"\(Self.escape(filename))\"\r\n")
        append("Content-Type: \(contentType)\r\n\r\n")
        body.append(data)
        append("\r\n")
    }

    /// The finished body (closing boundary appended).
    public func finalized() -> Data {
        var out = body
        out.append(Data("--\(boundary)--\r\n".utf8))
        return out
    }

    private mutating func append(_ string: String) { body.append(Data(string.utf8)) }

    private static func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "\"", with: "%22").replacingOccurrences(of: "\r", with: "").replacingOccurrences(of: "\n", with: "")
    }
}

public enum FileUploadError: Error, Equatable, LocalizedError {
    case tooLarge(bytes: Int)
    case notUploaded(status: String)

    public var errorDescription: String? {
        switch self {
        case .tooLarge(let bytes):
            return "Image is too large (\(ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file))); the limit is 20 MB."
        case .notUploaded(let status):
            return "Image upload didn't complete (status: \(status))."
        }
    }
}

// File Upload API — verified against developers.notion.com ("Uploading small files"): create
// (`POST /v1/file_uploads`, mode single_part), then send the bytes as multipart form-data
// (`POST /v1/file_uploads/{id}/send`, field `file`), then attach within 1 hour, e.g. as an image
// block `{"type":"file_upload","file_upload":{"id":…}}`. Single-part uploads are ≤ 20 MB.
extension NotionClient {
    /// The single-part upload limit (files above need multi-part mode, which the editor doesn't use).
    public static let singlePartUploadLimit = 20 * 1024 * 1024

    public func createFileUpload(filename: String, contentType: String) async throws -> FileUploadObject {
        try await request(method: "POST", path: "file_uploads", body: .object([
            "mode": .string("single_part"),
            "filename": .string(filename),
            "content_type": .string(contentType),
        ]))
    }

    public func sendFileUpload(id: String, data: Data, filename: String, contentType: String) async throws -> FileUploadObject {
        var form = MultipartFormData()
        form.addFile(name: "file", filename: filename, contentType: contentType, data: data)
        let response = try await performRequest(
            method: "POST", path: "file_uploads/\(id)/send", query: [:], body: nil,
            rawBody: (form.finalized(), form.contentType)
        )
        do {
            return try JSONDecoder().decode(FileUploadObject.self, from: response)
        } catch {
            throw NotionError.decoding(String(describing: error))
        }
    }

    /// Create + send in one go. Returns the file upload id, ready to attach.
    public func uploadFile(data: Data, filename: String, contentType: String) async throws -> String {
        guard data.count <= Self.singlePartUploadLimit else { throw FileUploadError.tooLarge(bytes: data.count) }
        let created = try await createFileUpload(filename: filename, contentType: contentType)
        let sent = try await sendFileUpload(id: created.id, data: data, filename: filename, contentType: contentType)
        guard sent.status == "uploaded" else { throw FileUploadError.notUploaded(status: sent.status) }
        return created.id
    }

    /// One block (`GET /v1/blocks/{id}`) — e.g. for a fresh signed URL of an image.
    public func retrieveBlock(_ blockId: String) async throws -> Block {
        try await request(method: "GET", path: "blocks/\(blockId)")
    }
}
