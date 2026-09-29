import Foundation

/// The Notion block kind one editor paragraph maps to. In the page editor, ONE paragraph of the
/// text view is ONE Notion block; the kind of a text paragraph is determined purely by its typed
/// line prefix (see `ParagraphSyntax`), tokens (non-text blocks shown as chips) by their attachment.
public enum ParagraphKind: Hashable, Sendable, Codable {
    case paragraph
    case heading1
    case heading2
    case heading3
    case bulleted
    case numbered
    case toDo(checked: Bool)
    case quote
    case code(language: String)
    case divider
    /// A collapsible block; its children are the following, more indented paragraphs.
    case toggle
    /// A highlighted block with an emoji icon ("" = a non-emoji icon, kept as is in Notion).
    case callout(icon: String)
    /// A block the editor can't edit as text (child_database, child_page, toggle, callout, image,
    /// embed, …). Shown as an atomic chip, never created, updated or deleted by the editor.
    case token(type: String, title: String)
    /// An image block: an atomic, non-editable paragraph rendered inline. `source` is an
    /// `ImageSource.encoded` string ("file:URL", "external:URL" or "upload:ID"). Only ever inserted
    /// or deleted by the sync planner, never updated.
    case image(source: String)

    /// The Notion API block type name.
    public var apiType: String {
        switch self {
        case .paragraph: return "paragraph"
        case .heading1: return "heading_1"
        case .heading2: return "heading_2"
        case .heading3: return "heading_3"
        case .bulleted: return "bulleted_list_item"
        case .numbered: return "numbered_list_item"
        case .toDo: return "to_do"
        case .quote: return "quote"
        case .code: return "code"
        case .divider: return "divider"
        case .toggle: return "toggle"
        case .callout: return "callout"
        case .token(let type, _): return type
        case .image: return "image"
        }
    }

    public var isImage: Bool {
        if case .image = self { return true }
        return false
    }

    public var isToken: Bool {
        if case .token = self { return true }
        return false
    }

    /// Whether the editor nests indented paragraphs under a block of this kind (Notion allows
    /// children on these; headings only when toggleable, which the editor doesn't model).
    public var canHaveChildren: Bool {
        switch self {
        case .paragraph, .bulleted, .numbered, .toDo, .quote, .toggle, .callout: return true
        default: return false
        }
    }

    public static let defaultCalloutIcon = "💡"

    /// Parses `tag` (the `.notionBlockKind` attribute value). Tokens aren't round-tripped here
    /// (their type/title live on the chip).
    public init?(tag: String) {
        switch tag {
        case "paragraph": self = .paragraph
        case "heading_1": self = .heading1
        case "heading_2": self = .heading2
        case "heading_3": self = .heading3
        case "bulleted_list_item": self = .bulleted
        case "numbered_list_item": self = .numbered
        case "to_do": self = .toDo(checked: false)
        case "to_do:checked": self = .toDo(checked: true)
        case "quote": self = .quote
        case "divider": self = .divider
        case "toggle": self = .toggle
        default:
            if tag.hasPrefix("code:") { self = .code(language: String(tag.dropFirst(5))) }
            else if tag.hasPrefix("callout:") { self = .callout(icon: String(tag.dropFirst(8))) }
            else if tag.hasPrefix("image:") { self = .image(source: String(tag.dropFirst(6))) }
            else if tag.hasPrefix("token:") { self = .token(type: String(tag.dropFirst(6)), title: "") }
            else { return nil }
        }
    }

    /// Whether the kind has editable rich text.
    public var hasText: Bool {
        switch self {
        case .divider, .token, .image: return false
        default: return true
        }
    }

    /// Short tag stored in the `.notionBlockKind` text attribute.
    public var tag: String {
        switch self {
        case .toDo(let checked): return checked ? "to_do:checked" : "to_do"
        case .code(let language): return "code:\(language)"
        case .callout(let icon): return "callout:\(icon)"
        case .token(let type, _): return "token:\(type)"
        case .image(let source): return "image:\(source)"
        default: return apiType
        }
    }
}

/// Markdown line syntax ↔ (depth, kind, content) — used for pasting Markdown in and copying it
/// out. The editor itself never stores these prefixes: a paragraph's kind lives in its
/// `.notionBlockKind` attribute and its text is only content.
///
/// - Leading tabs = nesting depth (capped at 3 for structure; all leading tabs are markup).
/// - Prefixes: `# ` `## ` `### ` `- ` `* ` `1. ` `- [ ] ` `- [x] ` `> ` `---` (whole line).
/// - Code: "```lang" + U+2028 + code lines separated by U+2028. The whole code block is ONE
///   paragraph (U+2028 is a line separator, not a paragraph separator, for NSString/NSTextView).
/// - U+2028 inside any other paragraph is a soft line break ("\n" inside the Notion block).
/// - A leading backslash escapes a paragraph whose text would otherwise read as a prefix.
///
/// `content` is inline Markdown (see `MarkdownParser.spans`/`MarkdownSerializer`) for text kinds,
/// plain text for code, empty for divider/token.
public enum ParagraphSyntax {
    public static let softBreak: Character = "\u{2028}"
    public static let softBreakString = "\u{2028}"
    public static let attachmentCharacter = "\u{FFFC}"
    public static let maxDepth = 3

    public struct Parsed: Equatable, Sendable {
        public var depth: Int
        public var kind: ParagraphKind
        public var content: String
        /// UTF-16 length of the leading tabs.
        public var indentLength: Int
        /// UTF-16 length of the kind marker after the tabs (e.g. 2 for "# ", 6 for "- [ ] ").
        public var markerLength: Int
    }

    public static func parse(_ text: String) -> Parsed {
        var rest = Substring(text)
        var tabs = 0
        while rest.hasPrefix("\t") { rest = rest.dropFirst(); tabs += 1 }
        let depth = min(tabs, maxDepth)

        func make(_ kind: ParagraphKind, marker: Int, content: Substring) -> Parsed {
            Parsed(depth: depth, kind: kind, content: fromSoftBreaks(String(content)), indentLength: tabs, markerLength: marker)
        }


        if rest.hasPrefix("\\") {
            return make(.paragraph, marker: 1, content: rest.dropFirst())
        }
        if rest.hasPrefix("```"), let sep = rest.firstIndex(of: softBreak) {
            let language = normalizeLanguage(String(rest[rest.index(rest.startIndex, offsetBy: 3)..<sep]))
            let marker = rest[rest.startIndex...sep].utf16.count
            return make(.code(language: language), marker: marker, content: rest[rest.index(after: sep)...])
        }
        if rest == "---" {
            return make(.divider, marker: 3, content: "")
        }
        let prefixes: [(String, ParagraphKind)] = [
            ("### ", .heading3), ("## ", .heading2), ("# ", .heading1),
            ("- [ ] ", .toDo(checked: false)), ("- [x] ", .toDo(checked: true)), ("- [X] ", .toDo(checked: true)),
            ("- ", .bulleted), ("* ", .bulleted), ("!> ", .callout(icon: ParagraphKind.defaultCalloutIcon)),
            ("+ ", .toggle), ("> ", .quote),
        ]
        for (prefix, kind) in prefixes where rest.hasPrefix(prefix) {
            return make(kind, marker: prefix.utf16.count, content: rest.dropFirst(prefix.count))
        }
        if let marker = numberedMarkerLength(rest) {
            return make(.numbered, marker: marker, content: rest.dropFirst(marker))
        }
        return make(.paragraph, marker: 0, content: rest)
    }

    /// The paragraph text for a block (without the paragraph terminator). `number` is only used
    /// for `.numbered` (display only — Notion numbers list items itself).
    public static func render(kind: ParagraphKind, content: String, depth: Int, number: Int = 1) -> String {
        let indent = String(repeating: "\t", count: max(0, min(depth, maxDepth)))
        let body = toSoftBreaks(content)
        switch kind {
        case .paragraph:
            return indent + (needsEscape(content) ? "\\" + body : body)
        case .heading1: return indent + "# " + body
        case .heading2: return indent + "## " + body
        case .heading3: return indent + "### " + body
        case .bulleted: return indent + "- " + body
        case .numbered: return indent + "\(number). " + body
        case .toDo(let checked): return indent + (checked ? "- [x] " : "- [ ] ") + body
        case .quote: return indent + "> " + body
        case .code(let language):
            let shown = language == "plain text" ? "" : language
            return indent + "```" + shown + softBreakString + body
        case .divider: return indent + "---"
        case .toggle: return indent + "+ " + body
        case .callout: return indent + "!> " + body
        case .token, .image: return indent + attachmentCharacter
        }
    }

    /// A paragraph's content needs a leading "\" when, rendered bare, it would parse as some other
    /// kind (e.g. a Notion paragraph whose text literally starts with "- ").
    static func needsEscape(_ content: String) -> Bool {
        if content.hasPrefix("\\") || content.hasPrefix("\t") { return true }
        let parsed = parse(toSoftBreaks(content))
        return parsed.kind != .paragraph || parsed.markerLength != 0
    }

    private static func numberedMarkerLength(_ text: Substring) -> Int? {
        let digits = text.prefix(while: { $0.isASCII && $0.isNumber })
        guard !digits.isEmpty, digits.count <= 9 else { return nil }
        let after = text.dropFirst(digits.count)
        guard after.hasPrefix(". ") else { return nil }
        return digits.count + 2
    }

    static func toSoftBreaks(_ s: String) -> String {
        s.replacingOccurrences(of: "\r\n", with: softBreakString)
            .replacingOccurrences(of: "\n", with: softBreakString)
            .replacingOccurrences(of: "\r", with: softBreakString)
    }

    static func fromSoftBreaks(_ s: String) -> String {
        s.replacingOccurrences(of: softBreakString, with: "\n")
    }

    // MARK: - Code languages

    /// Notion's accepted code-block languages.
    public static let notionLanguages: Set<String> = [
        "abap", "abc", "agda", "arduino", "ascii art", "assembly", "bash", "basic", "bnf", "c", "c#", "c++",
        "clojure", "coffeescript", "coq", "css", "dart", "dhall", "diff", "docker", "ebnf", "elixir", "elm",
        "erlang", "f#", "flow", "fortran", "gherkin", "glsl", "go", "graphql", "groovy", "haskell", "hcl",
        "html", "idris", "java", "javascript", "json", "julia", "kotlin", "latex", "less", "lisp",
        "livescript", "llvm ir", "lua", "makefile", "markdown", "markup", "matlab", "mathematica", "mermaid",
        "nix", "notion formula", "objective-c", "ocaml", "pascal", "perl", "php", "plain text", "powershell",
        "prolog", "protobuf", "purescript", "python", "r", "racket", "reason", "ruby", "rust", "sass", "scala",
        "scheme", "scss", "shell", "smalltalk", "solidity", "sql", "swift", "toml", "typescript", "vb.net",
        "verilog", "vhdl", "visual basic", "webassembly", "xml", "yaml", "java/c/c++/c#",
    ]

    private static let languageAliases: [String: String] = [
        "": "plain text", "text": "plain text", "plain": "plain text", "txt": "plain text",
        "js": "javascript", "ts": "typescript", "py": "python", "sh": "shell", "zsh": "shell",
        "yml": "yaml", "objc": "objective-c", "md": "markdown", "rb": "ruby", "kt": "kotlin",
        "cpp": "c++", "cs": "c#", "csharp": "c#", "rs": "rust", "golang": "go", "dockerfile": "docker",
    ]

    /// Canonical language for a typed/served language name. Unknown names are kept verbatim (so a
    /// served language always round-trips); `sendableLanguage` maps those to "plain text".
    public static func normalizeLanguage(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        let lower = trimmed.lowercased()
        if let alias = languageAliases[lower] { return alias }
        if notionLanguages.contains(lower) { return lower }
        return trimmed
    }

    /// A language Notion will accept for a write.
    public static func sendableLanguage(_ language: String) -> String {
        let normalized = normalizeLanguage(language)
        return notionLanguages.contains(normalized) ? normalized : "plain text"
    }
}

