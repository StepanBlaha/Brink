import Foundation

/// Links to a Notion page and the "open a database row as a page" target. Pure, so it is tested
/// without AppKit; the app picks `appURL` when the Notion app is installed, else `webURL`.
public enum NotionLink {
    /// A Notion id without dashes, as used in notion.so URLs.
    public static func compactID(_ id: String) -> String {
        id.replacingOccurrences(of: "-", with: "")
    }

    public static func appURL(id: String) -> URL? {
        URL(string: "notion://www.notion.so/\(compactID(id))")
    }

    public static func webURL(id: String) -> URL? {
        URL(string: "https://www.notion.so/\(compactID(id))")
    }

    /// notion:// when the Notion app is installed, otherwise https.
    public static func preferredURL(id: String, appInstalled: Bool) -> URL? {
        appInstalled ? appURL(id: id) : webURL(id: id)
    }
}

/// A database row (a Notion page) to show in the side view, and the pin whose panel hosts it.
public struct RowPageTarget: Equatable, Sendable {
    public let pinID: String
    public let rowID: String
    public let title: String

    public init(pinID: String, rowID: String, title: String) {
        self.pinID = pinID
        self.rowID = rowID
        self.title = title
    }

    /// The title shown in the header; an empty one reads "Untitled".
    public var displayTitle: String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Untitled" : trimmed
    }

    /// The cache key for this row's page, kept apart from the pin's own cache entry.
    public var cacheKey: String { "row-\(rowID)" }

    /// A request made before the panel existed (menu bar, hover peek) is for `pinID` only.
    public func isFor(pin id: String) -> Bool { pinID == id }
}
