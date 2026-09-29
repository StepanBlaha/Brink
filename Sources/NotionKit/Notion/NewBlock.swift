import Foundation

/// The kinds `NewBlock.formatted` can create — the block types the Markdown parser produces.
public enum NewBlockKind: String, Sendable, Equatable, Codable {
    case paragraph, heading1, heading2, heading3, toDo, bulletedListItem, numberedListItem, quote, code, divider
    /// Additive.
    case toggle, callout

    var apiType: String {
        switch self {
        case .paragraph: return "paragraph"
        case .heading1: return "heading_1"
        case .heading2: return "heading_2"
        case .heading3: return "heading_3"
        case .toDo: return "to_do"
        case .bulletedListItem: return "bulleted_list_item"
        case .numberedListItem: return "numbered_list_item"
        case .quote: return "quote"
        case .code: return "code"
        case .divider: return "divider"
        case .toggle: return "toggle"
        case .callout: return "callout"
        }
    }
}

/// A block to append via `appendBlocks`. Only the block kinds v1 can create.
///
/// `.paragraph` and `.toDo` are the original plain-text cases, kept exactly as they were so any
/// writes already sitting in a user's persisted `WriteQueue` still decode. `.formatted` is the
/// additive case used by the Markdown composer/editor to create any supported block kind with
/// full rich-text annotations.
public enum NewBlock: Sendable, Equatable {
    case paragraph(String)
    case toDo(String, checked: Bool = false)
    case formatted(NewBlockKind, richText: [RichTextSpan], language: String = "plain text", checked: Bool = false)
    /// Additive: a callout with an emoji icon (`nil` = Notion's default).
    case callout(richText: [RichTextSpan], emoji: String?)
    /// Additive: an image block from a completed file upload (`POST /v1/file_uploads`).
    case imageUpload(id: String)
    /// Additive: an image block showing an external URL.
    case imageExternal(URL)

    var requestJSON: JSONValue {
        switch self {
        case .paragraph(let text):
            return .object(["type": .string("paragraph"), "paragraph": .object(["rich_text": .array(RichText.encode(text))])])
        case .toDo(let text, let checked):
            return .object([
                "type": .string("to_do"),
                "to_do": .object(["rich_text": .array(RichText.encode(text)), "checked": .bool(checked)]),
            ])
        case .formatted(let kind, let richText, let language, let checked):
            let apiType = kind.apiType
            if kind == .divider {
                return .object(["type": .string(apiType), apiType: .object([:])])
            }
            var box: [String: JSONValue] = ["rich_text": .array(RichText.encode(spans: richText))]
            if kind == .toDo { box["checked"] = .bool(checked) }
            if kind == .code { box["language"] = .string(language) }
            return .object(["type": .string(apiType), apiType: .object(box)])
        case .callout(let richText, let emoji):
            var box: [String: JSONValue] = ["rich_text": .array(RichText.encode(spans: richText))]
            if let emoji, !emoji.isEmpty { box["icon"] = .object(["type": .string("emoji"), "emoji": .string(emoji)]) }
            return .object(["type": .string("callout"), "callout": .object(box)])
        case .imageUpload(let id):
            return .object(["type": .string("image"), "image": .object([
                "type": .string("file_upload"), "file_upload": .object(["id": .string(id)]),
            ])])
        case .imageExternal(let url):
            return .object(["type": .string("image"), "image": .object([
                "type": .string("external"), "external": .object(["url": .string(url.absoluteString)]),
            ])])
        }
    }

    /// Convenience for building a plain-text formatted block (no annotations) of any kind.
    public static func formatted(_ kind: NewBlockKind, text: String, language: String = "plain text", checked: Bool = false) -> NewBlock {
        .formatted(kind, richText: text.isEmpty ? [] : [RichTextSpan(text: text)], language: language, checked: checked)
    }
}

/// Where to insert appended blocks (API 2025-09-03's `position` param on `PATCH /blocks/{id}/children`;
/// the older top-level `after` string field is deprecated in favor of this).
public enum BlockPosition: Sendable, Equatable, Codable {
    case end
    case start
    case after(String)

    var requestJSON: JSONValue? {
        switch self {
        case .end: return nil // the API's own default; omitting the field is simplest.
        case .start: return .object(["type": .string("start")])
        case .after(let blockId): return .object(["type": .string("after_block"), "after_block": .object(["id": .string(blockId)])])
        }
    }
}

/// The payload for `updateBlock`: either replaces the block's text, or (for to-dos) its checked state.
public enum BlockUpdate: Sendable, Equatable {
    case text(String)
    case checked(Bool)
    /// Additive: replaces the block's text with fully-annotated rich text spans.
    case richText([RichTextSpan])
    /// Additive: the page editor's full in-place update — rich text plus, for to-dos, the checked
    /// state and, for code, the language — in ONE request.
    case content(richText: [RichTextSpan], checked: Bool?, language: String?)
    /// Additive: rich text plus (when non-nil) a new emoji icon, for callouts. Omitting the icon
    /// keeps whatever icon the block has (including non-emoji ones).
    case calloutContent(richText: [RichTextSpan], emoji: String?)
}

extension NewBlock: Codable {
    private enum Kind: String, Codable { case paragraph, toDo, formatted, callout, imageUpload, imageExternal }
    private enum CodingKeys: String, CodingKey { case kind, text, checked, blockKind, richText, language, emoji, id, url }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Kind.self, forKey: .kind) {
        case .paragraph:
            self = .paragraph(try container.decode(String.self, forKey: .text))
        case .toDo:
            let text = try container.decode(String.self, forKey: .text)
            let checked = try container.decodeIfPresent(Bool.self, forKey: .checked) ?? false
            self = .toDo(text, checked: checked)
        case .formatted:
            let blockKind = try container.decode(NewBlockKind.self, forKey: .blockKind)
            let richText = try container.decodeIfPresent([RichTextSpan].self, forKey: .richText) ?? []
            let language = try container.decodeIfPresent(String.self, forKey: .language) ?? "plain text"
            let checked = try container.decodeIfPresent(Bool.self, forKey: .checked) ?? false
            self = .formatted(blockKind, richText: richText, language: language, checked: checked)
        case .callout:
            self = .callout(
                richText: try container.decodeIfPresent([RichTextSpan].self, forKey: .richText) ?? [],
                emoji: try container.decodeIfPresent(String.self, forKey: .emoji)
            )
        case .imageUpload:
            self = .imageUpload(id: try container.decode(String.self, forKey: .id))
        case .imageExternal:
            self = .imageExternal(try container.decode(URL.self, forKey: .url))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .imageUpload(let id):
            try container.encode(Kind.imageUpload, forKey: .kind)
            try container.encode(id, forKey: .id)
        case .imageExternal(let url):
            try container.encode(Kind.imageExternal, forKey: .kind)
            try container.encode(url, forKey: .url)
        case .paragraph(let text):
            try container.encode(Kind.paragraph, forKey: .kind)
            try container.encode(text, forKey: .text)
        case .toDo(let text, let checked):
            try container.encode(Kind.toDo, forKey: .kind)
            try container.encode(text, forKey: .text)
            try container.encode(checked, forKey: .checked)
        case .formatted(let blockKind, let richText, let language, let checked):
            try container.encode(Kind.formatted, forKey: .kind)
            try container.encode(blockKind, forKey: .blockKind)
            try container.encode(richText, forKey: .richText)
            try container.encode(language, forKey: .language)
            try container.encode(checked, forKey: .checked)
        case .callout(let richText, let emoji):
            try container.encode(Kind.callout, forKey: .kind)
            try container.encode(richText, forKey: .richText)
            try container.encodeIfPresent(emoji, forKey: .emoji)
        }
    }
}

extension BlockUpdate: Codable {
    private enum Kind: String, Codable { case text, checked, richText, content, calloutContent }
    private enum CodingKeys: String, CodingKey { case kind, text, checked, richText, language, emoji }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Kind.self, forKey: .kind) {
        case .text:
            self = .text(try container.decode(String.self, forKey: .text))
        case .checked:
            self = .checked(try container.decode(Bool.self, forKey: .checked))
        case .richText:
            self = .richText(try container.decode([RichTextSpan].self, forKey: .richText))
        case .content:
            self = .content(
                richText: try container.decode([RichTextSpan].self, forKey: .richText),
                checked: try container.decodeIfPresent(Bool.self, forKey: .checked),
                language: try container.decodeIfPresent(String.self, forKey: .language)
            )
        case .calloutContent:
            self = .calloutContent(
                richText: try container.decode([RichTextSpan].self, forKey: .richText),
                emoji: try container.decodeIfPresent(String.self, forKey: .emoji)
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .text(let value):
            try container.encode(Kind.text, forKey: .kind)
            try container.encode(value, forKey: .text)
        case .checked(let value):
            try container.encode(Kind.checked, forKey: .kind)
            try container.encode(value, forKey: .checked)
        case .richText(let value):
            try container.encode(Kind.richText, forKey: .kind)
            try container.encode(value, forKey: .richText)
        case .content(let richText, let checked, let language):
            try container.encode(Kind.content, forKey: .kind)
            try container.encode(richText, forKey: .richText)
            try container.encodeIfPresent(checked, forKey: .checked)
            try container.encodeIfPresent(language, forKey: .language)
        case .calloutContent(let richText, let emoji):
            try container.encode(Kind.calloutContent, forKey: .kind)
            try container.encode(richText, forKey: .richText)
            try container.encodeIfPresent(emoji, forKey: .emoji)
        }
    }
}
