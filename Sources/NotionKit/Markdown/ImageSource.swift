import Foundation

/// Where an image paragraph's picture comes from (`ParagraphKind.image(source:)` holds `encoded`).
public enum ImageSource: Equatable, Sendable {
    /// A Notion-hosted file (signed URL that expires).
    case file(URL)
    /// An external image URL.
    case external(URL)
    /// A file upload attached in this session (`POST /v1/file_uploads`), before Notion's own
    /// file URL is known.
    case upload(id: String)

    public var encoded: String {
        switch self {
        case .file(let url): return "file:" + url.absoluteString
        case .external(let url): return "external:" + url.absoluteString
        case .upload(let id): return "upload:" + id
        }
    }

    public init?(encoded: String) {
        if encoded.hasPrefix("file:"), let url = URL(string: String(encoded.dropFirst(5))) { self = .file(url) }
        else if encoded.hasPrefix("external:"), let url = URL(string: String(encoded.dropFirst(9))) { self = .external(url) }
        else if encoded.hasPrefix("upload:") { self = .upload(id: String(encoded.dropFirst(7))) }
        else { return nil }
    }

    public var url: URL? {
        switch self {
        case .file(let url), .external(let url): return url
        case .upload: return nil
        }
    }
}

/// An image paragraph, as handed to the app's attachment factory.
public struct ImageInfo: Equatable, Sendable {
    /// The Notion block id, once the image exists in Notion.
    public let blockID: String?
    public let source: ImageSource?

    public init(blockID: String?, source: ImageSource?) {
        self.blockID = blockID
        self.source = source
    }
}
