import Foundation

public enum NotionError: Error, Sendable, Equatable {
    case unauthorized
    case notFound
    case notShared
    case rateLimited
    case api(code: String, message: String)
    case decoding(String)
    case network(String)
    case missingToken
}

extension NotionError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .unauthorized: return "The Notion token is invalid or expired."
        case .notFound: return "That Notion item was not found."
        case .notShared: return "This page or database isn't shared with the integration."
        case .rateLimited: return "Notion is rate limiting requests. Try again shortly."
        case .api(let code, let message): return "Notion API error (\(code)): \(message)"
        case .decoding(let detail): return "Failed to decode Notion response: \(detail)"
        case .network(let detail): return "Network error: \(detail)"
        case .missingToken: return "No Notion token is configured."
        }
    }
}

extension NotionError {
    /// Errors worth retrying later rather than discarding the write.
    public var isTransient: Bool {
        switch self {
        case .network, .rateLimited, .unauthorized, .missingToken: return true
        case .notFound, .notShared, .api, .decoding: return false
        }
    }
}
