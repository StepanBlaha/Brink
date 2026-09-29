import Foundation

public enum BlockType: Sendable, Equatable {
    case paragraph
    case heading1
    case heading2
    case heading3
    case toDo(checked: Bool)
    case bulletedListItem
    case numberedListItem
    case toggle
    case quote
    case callout
    case divider
    case code(language: String)
    case childDatabase(title: String)
    case childPage(title: String)
    case unsupported(type: String)
}

public struct Block: Sendable, Equatable, Identifiable {
    public let id: String
    public let type: BlockType
    public let hasChildren: Bool
    /// The block's formatted content as editable spans. Empty for blocks with no text (divider,
    /// child page/database — those keep their title in `plainText` via a single plain span).
    public let richText: [RichTextSpan]
    /// Additive: the block's own icon (callouts), if any.
    public let icon: Icon?
    /// Additive: for `image` blocks (type `.unsupported("image")`), where the picture lives as an
    /// `ImageSource.encoded` string ("file:URL" / "external:URL" / "upload:ID").
    public let imageSource: String?

    /// Convenience: the block's content flattened to a plain string (spans' text joined).
    public var plainText: String { richText.map(\.text).joined() }

    public init(id: String, type: BlockType, hasChildren: Bool, richText: [RichTextSpan], icon: Icon? = nil, imageSource: String? = nil) {
        self.id = id
        self.type = type
        self.hasChildren = hasChildren
        self.richText = richText
        self.icon = icon
        self.imageSource = imageSource
    }

    /// Back-compat convenience for callers that only deal in plain strings.
    public init(id: String, type: BlockType, hasChildren: Bool, plainText: String) {
        self.init(id: id, type: type, hasChildren: hasChildren, richText: plainText.isEmpty ? [] : [RichTextSpan(text: plainText)])
    }
}

extension Block: Codable {
    private enum CodingKeys: String, CodingKey {
        case id, type, hasChildren = "has_children"
        case paragraph, heading1 = "heading_1", heading2 = "heading_2", heading3 = "heading_3"
        case toDo = "to_do", bulletedListItem = "bulleted_list_item", numberedListItem = "numbered_list_item"
        case toggle, quote, callout, code
        case childDatabase = "child_database", childPage = "child_page"
        case image
    }
    private struct ImageBox: Codable {
        struct URLBox: Codable { let url: String }
        struct IDBox: Codable { let id: String }
        let type: String?
        let file: URLBox?
        let external: URLBox?
        let fileUpload: IDBox?
        enum CodingKeys: String, CodingKey { case type, file, external, fileUpload = "file_upload" }

        var encodedSource: String? {
            if let url = file?.url { return "file:" + url }
            if let url = external?.url { return "external:" + url }
            if let id = fileUpload?.id { return "upload:" + id }
            return nil
        }

        init?(encodedSource: String) {
            if encodedSource.hasPrefix("file:") {
                type = "file"; file = URLBox(url: String(encodedSource.dropFirst(5))); external = nil; fileUpload = nil
            } else if encodedSource.hasPrefix("external:") {
                type = "external"; external = URLBox(url: String(encodedSource.dropFirst(9))); file = nil; fileUpload = nil
            } else if encodedSource.hasPrefix("upload:") {
                type = "file_upload"; fileUpload = IDBox(id: String(encodedSource.dropFirst(7))); file = nil; external = nil
            } else {
                return nil
            }
        }
    }
    private struct TitleBox: Decodable { let title: String? }
    private struct RichTextBox: Decodable { let richText: [RichTextItem]?
        enum CodingKeys: String, CodingKey { case richText = "rich_text" }
    }
    private struct ToDoBox: Decodable {
        let richText: [RichTextItem]?
        let checked: Bool?
        enum CodingKeys: String, CodingKey { case richText = "rich_text", checked }
    }
    private struct CalloutBox: Decodable {
        let richText: [RichTextItem]?
        let icon: Icon?
        enum CodingKeys: String, CodingKey { case richText = "rich_text", icon }
    }
    private struct CalloutBoxEncode: Encodable {
        let richText: [JSONValue]
        let icon: Icon?
        enum CodingKeys: String, CodingKey { case richText = "rich_text", icon }
        init(_ spans: [RichTextSpan], icon: Icon?) { richText = RichText.encode(spans: spans); self.icon = icon }
    }
    private struct CodeBox: Decodable {
        let richText: [RichTextItem]?
        let language: String?
        enum CodingKeys: String, CodingKey { case richText = "rich_text", language }
    }
    private struct RichTextBoxEncode: Encodable {
        let richText: [JSONValue]
        enum CodingKeys: String, CodingKey { case richText = "rich_text" }
        init(_ spans: [RichTextSpan]) { richText = RichText.encode(spans: spans) }
    }
    private struct ToDoBoxEncode: Encodable {
        let richText: [JSONValue]
        let checked: Bool
        enum CodingKeys: String, CodingKey { case richText = "rich_text", checked }
        init(_ spans: [RichTextSpan], checked: Bool) { richText = RichText.encode(spans: spans); self.checked = checked }
    }
    private struct CodeBoxEncode: Encodable {
        let richText: [JSONValue]
        let language: String
        enum CodingKeys: String, CodingKey { case richText = "rich_text", language }
        init(_ spans: [RichTextSpan], language: String) { richText = RichText.encode(spans: spans); self.language = language }
    }
    private struct TitleBoxEncode: Encodable { let title: String }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        hasChildren = try container.decodeIfPresent(Bool.self, forKey: .hasChildren) ?? false
        let typeName = try container.decode(String.self, forKey: .type)
        var decodedIcon: Icon?
        var decodedImage: String?

        func spans(_ key: CodingKeys) -> [RichTextSpan] {
            (try? container.decodeIfPresent(RichTextBox.self, forKey: key))
                .flatMap { $0?.richText }
                .map(RichText.spans(from:)) ?? []
        }

        switch typeName {
        case "paragraph":
            type = .paragraph; richText = spans(.paragraph)
        case "heading_1":
            type = .heading1; richText = spans(.heading1)
        case "heading_2":
            type = .heading2; richText = spans(.heading2)
        case "heading_3":
            type = .heading3; richText = spans(.heading3)
        case "to_do":
            let box = try container.decodeIfPresent(ToDoBox.self, forKey: .toDo)
            type = .toDo(checked: box?.checked ?? false)
            richText = box?.richText.map(RichText.spans(from:)) ?? []
        case "bulleted_list_item":
            type = .bulletedListItem; richText = spans(.bulletedListItem)
        case "numbered_list_item":
            type = .numberedListItem; richText = spans(.numberedListItem)
        case "toggle":
            type = .toggle; richText = spans(.toggle)
        case "quote":
            type = .quote; richText = spans(.quote)
        case "callout":
            let box = try? container.decodeIfPresent(CalloutBox.self, forKey: .callout)
            type = .callout
            richText = box?.richText.map(RichText.spans(from:)) ?? []
            decodedIcon = box?.icon
        case "divider":
            type = .divider; richText = []
        case "code":
            let box = try container.decodeIfPresent(CodeBox.self, forKey: .code)
            type = .code(language: box?.language ?? "plain text")
            richText = box?.richText.map(RichText.spans(from:)) ?? []
        case "child_database":
            let box = try container.decodeIfPresent(TitleBox.self, forKey: .childDatabase)
            type = .childDatabase(title: box?.title ?? "Untitled")
            richText = (box?.title).map { $0.isEmpty ? [] : [RichTextSpan(text: $0)] } ?? []
        case "child_page":
            let box = try container.decodeIfPresent(TitleBox.self, forKey: .childPage)
            type = .childPage(title: box?.title ?? "Untitled")
            richText = (box?.title).map { $0.isEmpty ? [] : [RichTextSpan(text: $0)] } ?? []
        case "image":
            type = .unsupported(type: typeName); richText = []
            decodedImage = (try? container.decodeIfPresent(ImageBox.self, forKey: .image))??.encodedSource
        default:
            type = .unsupported(type: typeName); richText = []
        }
        icon = decodedIcon
        imageSource = decodedImage
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(hasChildren, forKey: .hasChildren)
        switch type {
        case .paragraph:
            try container.encode("paragraph", forKey: .type)
            try container.encode(RichTextBoxEncode(richText), forKey: .paragraph)
        case .heading1:
            try container.encode("heading_1", forKey: .type)
            try container.encode(RichTextBoxEncode(richText), forKey: .heading1)
        case .heading2:
            try container.encode("heading_2", forKey: .type)
            try container.encode(RichTextBoxEncode(richText), forKey: .heading2)
        case .heading3:
            try container.encode("heading_3", forKey: .type)
            try container.encode(RichTextBoxEncode(richText), forKey: .heading3)
        case .toDo(let checked):
            try container.encode("to_do", forKey: .type)
            try container.encode(ToDoBoxEncode(richText, checked: checked), forKey: .toDo)
        case .bulletedListItem:
            try container.encode("bulleted_list_item", forKey: .type)
            try container.encode(RichTextBoxEncode(richText), forKey: .bulletedListItem)
        case .numberedListItem:
            try container.encode("numbered_list_item", forKey: .type)
            try container.encode(RichTextBoxEncode(richText), forKey: .numberedListItem)
        case .toggle:
            try container.encode("toggle", forKey: .type)
            try container.encode(RichTextBoxEncode(richText), forKey: .toggle)
        case .quote:
            try container.encode("quote", forKey: .type)
            try container.encode(RichTextBoxEncode(richText), forKey: .quote)
        case .callout:
            try container.encode("callout", forKey: .type)
            try container.encode(CalloutBoxEncode(richText, icon: icon), forKey: .callout)
        case .divider:
            try container.encode("divider", forKey: .type)
        case .code(let language):
            try container.encode("code", forKey: .type)
            try container.encode(CodeBoxEncode(richText, language: language), forKey: .code)
        case .childDatabase(let title):
            try container.encode("child_database", forKey: .type)
            try container.encode(TitleBoxEncode(title: title), forKey: .childDatabase)
        case .childPage(let title):
            try container.encode("child_page", forKey: .type)
            try container.encode(TitleBoxEncode(title: title), forKey: .childPage)
        case .unsupported(let typeName):
            try container.encode(typeName, forKey: .type)
            if typeName == "image", let imageSource, let box = ImageBox(encodedSource: imageSource) {
                try container.encode(box, forKey: .image)
            }
        }
    }
}
