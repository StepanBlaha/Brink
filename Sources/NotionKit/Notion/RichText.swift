import Foundation

/// A rich text item as returned by the Notion API.
public struct RichTextItem: Decodable, Sendable, Equatable {
    public let plainText: String
    public let href: String?
    public let annotations: Annotations?

    public struct Annotations: Decodable, Sendable, Equatable {
        public let bold: Bool
        public let italic: Bool
        public let strikethrough: Bool
        public let underline: Bool
        public let code: Bool

        public init(bold: Bool = false, italic: Bool = false, strikethrough: Bool = false, underline: Bool = false, code: Bool = false) {
            self.bold = bold
            self.italic = italic
            self.strikethrough = strikethrough
            self.underline = underline
            self.code = code
        }
    }

    public init(plainText: String, href: String? = nil, annotations: Annotations? = nil) {
        self.plainText = plainText
        self.href = href
        self.annotations = annotations
    }

    private enum CodingKeys: String, CodingKey {
        case plainText = "plain_text"
        case href
        case annotations
    }
}

/// A single run of text carrying Markdown-style formatting: the in-memory representation for a
/// block's content, used both to render Notion's rich text arrays and to build them from Markdown.
public struct RichTextSpan: Sendable, Equatable, Codable {
    public var text: String
    public var bold: Bool
    public var italic: Bool
    public var strikethrough: Bool
    public var code: Bool
    public var link: URL?

    public init(text: String, bold: Bool = false, italic: Bool = false, strikethrough: Bool = false, code: Bool = false, link: URL? = nil) {
        self.text = text
        self.bold = bold
        self.italic = italic
        self.strikethrough = strikethrough
        self.code = code
        self.link = link
    }
}

public enum RichText {
    public static let chunkLimit = 2000

    /// Joins decoded rich text items into a single plain string.
    public static func plainText(from items: [RichTextItem]) -> String {
        items.map(\.plainText).joined()
    }

    /// Converts decoded rich text items (with annotations/href) into editable spans.
    public static func spans(from items: [RichTextItem]) -> [RichTextSpan] {
        items.map { item in
            RichTextSpan(
                text: item.plainText,
                bold: item.annotations?.bold ?? false,
                italic: item.annotations?.italic ?? false,
                strikethrough: item.annotations?.strikethrough ?? false,
                code: item.annotations?.code ?? false,
                link: item.href.flatMap(URL.init(string:))
            )
        }
    }

    /// Splits `text` into chunks no longer than `limit` characters, for building request payloads.
    public static func chunked(_ text: String, limit: Int = chunkLimit) -> [String] {
        guard limit > 0 else { return [text] }
        if text.isEmpty { return [""] }
        var result: [String] = []
        var start = text.startIndex
        while start < text.endIndex {
            let end = text.index(start, offsetBy: limit, limitedBy: text.endIndex) ?? text.endIndex
            result.append(String(text[start..<end]))
            start = end
        }
        return result
    }

    /// Builds the request-side rich text array for `text`, chunked to the API's 2000-char limit.
    /// Plain text, no annotations — kept for callers that only ever dealt in unformatted strings.
    public static func encode(_ text: String, limit: Int = chunkLimit) -> [JSONValue] {
        chunked(text, limit: limit).map { chunk in
            .object(["type": .string("text"), "text": .object(["content": .string(chunk)])])
        }
    }

    /// Builds the request-side rich text array for `spans`, preserving each span's annotations
    /// and link, chunking any span longer than `limit` characters into multiple text objects.
    public static func encode(spans: [RichTextSpan], limit: Int = chunkLimit) -> [JSONValue] {
        guard !spans.isEmpty else { return [] }
        return spans.flatMap { span -> [JSONValue] in
            chunked(span.text, limit: limit).map { chunk in
                var textBox: [String: JSONValue] = ["content": .string(chunk)]
                if let link = span.link {
                    textBox["link"] = .object(["url": .string(link.absoluteString)])
                }
                let annotations: [String: JSONValue] = [
                    "bold": .bool(span.bold),
                    "italic": .bool(span.italic),
                    "strikethrough": .bool(span.strikethrough),
                    "underline": .bool(false),
                    "code": .bool(span.code),
                ]
                return .object([
                    "type": .string("text"),
                    "text": .object(textBox),
                    "annotations": .object(annotations),
                ])
            }
        }
    }
}
