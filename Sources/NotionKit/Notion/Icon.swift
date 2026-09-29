import Foundation

public enum Icon: Sendable, Equatable, Codable {
    case emoji(String)
    case external(URL)
    case file(URL)
    case none

    private enum CodingKeys: String, CodingKey {
        case type, emoji, external, file, customEmoji = "custom_emoji"
    }
    private struct URLBox: Codable { let url: URL }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decodeIfPresent(String.self, forKey: .type)
        switch type {
        case "emoji":
            self = .emoji(try container.decode(String.self, forKey: .emoji))
        case "external":
            self = .external(try container.decode(URLBox.self, forKey: .external).url)
        case "file":
            self = .file(try container.decode(URLBox.self, forKey: .file).url)
        case "custom_emoji":
            self = .external(try container.decode(URLBox.self, forKey: .customEmoji).url)
        default:
            self = .none
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .emoji(let value):
            try container.encode("emoji", forKey: .type)
            try container.encode(value, forKey: .emoji)
        case .external(let url):
            try container.encode("external", forKey: .type)
            try container.encode(URLBox(url: url), forKey: .external)
        case .file(let url):
            try container.encode("file", forKey: .type)
            try container.encode(URLBox(url: url), forKey: .file)
        case .none:
            break
        }
    }
}
