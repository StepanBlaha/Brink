import Foundation

/// Additive: setting a page's icon to an emoji, for the "Also set as page icon in Notion"
/// toggle in the icon picker. Kept in its own file/extension (rather than inside
/// `NotionClient.swift`) to avoid editing that file concurrently with other work.
public extension NotionClient {
    /// `PATCH /v1/pages/{page_id}` with `{"icon": {"type": "emoji", "emoji": "…"}}`.
    /// Shape verified against the Notion API reference ("Update page properties" /
    /// `icon` field of a page object): https://developers.notion.com/reference/page
    @discardableResult
    func setPageEmojiIcon(pageId: String, emoji: String) async throws -> PageMeta {
        let body: JSONValue = .object([
            "icon": .object(["type": .string("emoji"), "emoji": .string(emoji)]),
        ])
        return try await request(method: "PATCH", path: "pages/\(pageId)", body: body)
    }
}
