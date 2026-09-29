import Foundation

/// What was on the pasteboard, reduced to what we can append to a page.
public enum ClipboardContent: Equatable, Sendable {
    case text(String)
    case image
    case empty
}

public enum ClipboardMapper {
    public enum Result: Equatable, Sendable {
        case blocks([NewBlock])
        case unsupported(String)
    }

    public static let imageMessage = "Images not supported yet"

    public static func map(_ content: ClipboardContent) -> Result {
        switch content {
        case .image: return .unsupported(imageMessage)
        case .empty: return .unsupported("Clipboard is empty")
        case .text(let raw):
            let text = raw.replacingOccurrences(of: "\r\n", with: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return .unsupported("Clipboard is empty") }
            if let url = singleURL(text) {
                return .blocks([.formatted(.paragraph, richText: [RichTextSpan(text: text, link: url)])])
            }
            if text.contains("\n") {
                let blocks = MarkdownParser.blocks(from: text)
                return blocks.isEmpty ? .unsupported("Clipboard is empty") : .blocks(blocks)
            }
            return .blocks([.formatted(.paragraph, richText: [RichTextSpan(text: text)])])
        }
    }

    /// A lone http(s) URL with no whitespace.
    static func singleURL(_ text: String) -> URL? {
        guard !text.contains(where: \.isWhitespace),
              let url = URL(string: text), let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https", url.host?.isEmpty == false else { return nil }
        return url
    }
}
