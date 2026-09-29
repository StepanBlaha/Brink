import Foundation

/// A Notion file object as used by page covers/icons: `external`, Notion-hosted `file` (signed
/// URL with `expiry_time`) or `file_upload`.
public struct FileRef: Decodable, Sendable, Equatable {
    public let url: URL
    /// Notion-hosted URLs expire (roughly hourly) and must be re-fetched from the API.
    public let expires: Bool

    public init(url: URL, expires: Bool) {
        self.url = url
        self.expires = expires
    }

    private enum CodingKeys: String, CodingKey { case type, external, file, fileUpload = "file_upload" }
    private struct URLBox: Decodable { let url: URL }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decodeIfPresent(String.self, forKey: .type)
        switch type {
        case "external":
            url = try container.decode(URLBox.self, forKey: .external).url
            expires = false
        case "file":
            url = try container.decode(URLBox.self, forKey: .file).url
            expires = true
        case "file_upload":
            url = try container.decode(URLBox.self, forKey: .fileUpload).url
            expires = true
        default:
            throw DecodingError.dataCorruptedError(forKey: .type, in: container, debugDescription: "Unsupported file type \(type ?? "nil")")
        }
    }
}

/// The parts of a page object the page view uses.
public struct PageMeta: Decodable, Sendable, Equatable {
    public let id: String
    public let cover: FileRef?
    public let icon: Icon?

    public init(id: String, cover: FileRef?, icon: Icon?) {
        self.id = id
        self.cover = cover
        self.icon = icon
    }

    private enum CodingKeys: String, CodingKey { case id, cover, icon }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        cover = try? container.decodeIfPresent(FileRef.self, forKey: .cover)
        icon = try? container.decodeIfPresent(Icon.self, forKey: .icon)
    }
}
