import Foundation

public struct SearchResult: Sendable, Equatable, Identifiable {
    public enum Kind: String, Sendable, Equatable {
        case page
        case dataSource
    }

    public let id: String
    public let kind: Kind
    public let title: String
    public let icon: Icon
    public let url: String?

    public init(id: String, kind: Kind, title: String, icon: Icon, url: String?) {
        self.id = id
        self.kind = kind
        self.title = title
        self.icon = icon
        self.url = url
    }
}

extension SearchResult: Decodable {
    private enum CodingKeys: String, CodingKey {
        case object, id, icon, url, title, properties
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let object = try container.decode(String.self, forKey: .object)
        id = try container.decode(String.self, forKey: .id)
        kind = object == "data_source" ? .dataSource : .page
        icon = try container.decodeIfPresent(Icon.self, forKey: .icon) ?? .none
        url = try container.decodeIfPresent(String.self, forKey: .url)

        if kind == .dataSource {
            let items = try container.decodeIfPresent([RichTextItem].self, forKey: .title) ?? []
            title = RichText.plainText(from: items)
        } else {
            let properties = try container.decodeIfPresent([String: PropertyValue].self, forKey: .properties) ?? [:]
            title = properties.values.compactMap { value -> String? in
                if case .title(let text) = value { return text }
                return nil
            }.first ?? ""
        }
    }
}
