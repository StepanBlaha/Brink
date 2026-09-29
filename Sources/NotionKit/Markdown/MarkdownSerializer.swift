import Foundation

/// The inverse of `MarkdownParser`: turns rich-text spans (and blocks) back into Markdown source,
/// for showing/editing a block's Markdown while it has focus.
public enum MarkdownSerializer {

    /// Serializes spans back to inline Markdown.
    public static func markdown(from spans: [RichTextSpan]) -> String {
        spans.map(serialize).joined()
    }

    private static func serialize(_ span: RichTextSpan) -> String {
        var text = span.text
        if span.code {
            text = "`\(text)`"
        } else if let link = span.link {
            text = "[\(text)](\(link.absoluteString))"
        }
        if span.bold && span.italic {
            text = "***\(text)***"
        } else if span.bold {
            text = "**\(text)**"
        } else if span.italic {
            text = "*\(text)*"
        }
        if span.strikethrough {
            text = "~~\(text)~~"
        }
        return text
    }

    /// The Markdown line-prefix for a block type (empty for types with no prefix, e.g. paragraph).
    public static func prefix(for type: BlockType) -> String {
        switch type {
        case .paragraph: return ""
        case .heading1: return "# "
        case .heading2: return "## "
        case .heading3: return "### "
        case .toDo(let checked): return checked ? "- [x] " : "- [ ] "
        case .bulletedListItem: return "- "
        case .numberedListItem: return "1. "
        case .toggle: return ""
        case .quote: return "> "
        case .callout: return ""
        case .divider: return "---"
        case .code: return ""
        case .childDatabase, .childPage, .unsupported: return ""
        }
    }

    /// Full Markdown source for one block: its prefix plus its serialized rich text.
    public static func markdown(for block: Block) -> String {
        prefix(for: block.type) + markdown(from: block.richText)
    }
}
