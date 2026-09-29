import Foundation

public struct Row: Sendable, Equatable, Identifiable {
    public let id: String
    public let url: String?
    public let icon: Icon
    public let title: String
    public let properties: [String: PropertyValue]

    public init(id: String, url: String?, icon: Icon, title: String, properties: [String: PropertyValue]) {
        self.id = id
        self.url = url
        self.icon = icon
        self.title = title
        self.properties = properties
    }
}

extension Row: Codable {
    private enum CodingKeys: String, CodingKey {
        case id, url, icon, properties
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        url = try container.decodeIfPresent(String.self, forKey: .url)
        icon = try container.decodeIfPresent(Icon.self, forKey: .icon) ?? .none
        properties = try container.decodeIfPresent([String: PropertyValue].self, forKey: .properties) ?? [:]
        title = properties.values.compactMap { value -> String? in
            if case .title(let text) = value { return text }
            return nil
        }.first ?? ""
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(url, forKey: .url)
        try container.encode(icon, forKey: .icon)
        try container.encode(properties, forKey: .properties)
    }
}
