import Foundation

/// The value of a single Notion page property, decoded from the property's Notion API shape.
public enum PropertyValue: Sendable, Equatable {
    case title(String)
    case richText(String)
    case checkbox(Bool)
    case status(name: String?)
    case select(name: String?)
    case date(start: String?, end: String?)
    case number(Double?)
    case unsupported(type: String)
}

extension PropertyValue: Codable {
    private enum CodingKeys: String, CodingKey {
        case type, title, richText = "rich_text", checkbox, status, select, date, number
    }
    private struct OptionBox: Codable { let name: String }
    private struct DateBox: Codable { let start: String?; let end: String? }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)
        switch type {
        case "title":
            if let items = try? container.decode([RichTextItem].self, forKey: .title) {
                self = .title(RichText.plainText(from: items))
            } else {
                self = .title(try container.decodeIfPresent(String.self, forKey: .title) ?? "")
            }
        case "rich_text":
            if let items = try? container.decode([RichTextItem].self, forKey: .richText) {
                self = .richText(RichText.plainText(from: items))
            } else {
                self = .richText(try container.decodeIfPresent(String.self, forKey: .richText) ?? "")
            }
        case "checkbox":
            self = .checkbox(try container.decodeIfPresent(Bool.self, forKey: .checkbox) ?? false)
        case "status":
            let option = try container.decodeIfPresent(OptionBox.self, forKey: .status)
            self = .status(name: option?.name)
        case "select":
            let option = try container.decodeIfPresent(OptionBox.self, forKey: .select)
            self = .select(name: option?.name)
        case "date":
            let box = try container.decodeIfPresent(DateBox.self, forKey: .date)
            self = .date(start: box?.start, end: box?.end)
        case "number":
            self = .number(try container.decodeIfPresent(Double.self, forKey: .number))
        default:
            self = .unsupported(type: type)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .title(let text):
            try container.encode("title", forKey: .type)
            try container.encode(text, forKey: .title)
        case .richText(let text):
            try container.encode("rich_text", forKey: .type)
            try container.encode(text, forKey: .richText)
        case .checkbox(let value):
            try container.encode("checkbox", forKey: .type)
            try container.encode(value, forKey: .checkbox)
        case .status(let name):
            try container.encode("status", forKey: .type)
            if let name { try container.encode(OptionBox(name: name), forKey: .status) }
        case .select(let name):
            try container.encode("select", forKey: .type)
            if let name { try container.encode(OptionBox(name: name), forKey: .select) }
        case .date(let start, let end):
            try container.encode("date", forKey: .type)
            if let start { try container.encode(DateBox(start: start, end: end), forKey: .date) }
        case .number(let value):
            try container.encode("number", forKey: .type)
            if let value { try container.encode(value, forKey: .number) }
        case .unsupported(let type):
            try container.encode(type, forKey: .type)
        }
    }
}

extension PropertyValue {
    /// Builds the request-side JSON for `PATCH /v1/pages/{id}` (update page properties).
    public var requestJSON: JSONValue? {
        switch self {
        case .title(let text):
            return .object(["type": .string("title"), "title": .array(RichText.encode(text))])
        case .richText(let text):
            return .object(["type": .string("rich_text"), "rich_text": .array(RichText.encode(text))])
        case .checkbox(let value):
            return .object(["type": .string("checkbox"), "checkbox": .bool(value)])
        case .status(let name):
            let value: JSONValue = name.map { .object(["name": .string($0)]) } ?? .null
            return .object(["type": .string("status"), "status": value])
        case .select(let name):
            let value: JSONValue = name.map { .object(["name": .string($0)]) } ?? .null
            return .object(["type": .string("select"), "select": value])
        case .date(let start, let end):
            guard let start else { return .object(["type": .string("date"), "date": .null]) }
            var box: [String: JSONValue] = ["start": .string(start)]
            if let end { box["end"] = .string(end) }
            return .object(["type": .string("date"), "date": .object(box)])
        case .number(let value):
            let json: JSONValue = value.map { .number($0) } ?? .null
            return .object(["type": .string("number"), "number": json])
        case .unsupported:
            return nil
        }
    }
}

/// A named property update to send via `updatePageProperties`.
public struct PropertyUpdate: Sendable, Equatable, Codable {
    public let name: String
    public let value: PropertyValue

    public init(name: String, value: PropertyValue) {
        self.name = name
        self.value = value
    }
}
