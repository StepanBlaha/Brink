import AppKit
import NotionKit

/// Visual styling for the Notion-style page editor. The text holds only block content; a
/// paragraph's kind and depth are the `.notionBlockKind`/`.notionDepth` attributes and inline
/// formatting is `.notionBold`/…, so this derives fonts, colors and paragraph insets from those.
/// Markers (bullets, numbers, checkboxes, quote bars, code/callout backgrounds, dividers, toggle
/// arrows) are drawn by `EditorTextView` in the left inset, never stored as text.
@MainActor
enum EditorStyling {
    static let indentPerLevel: CGFloat = 24
    static let bodySize: CGFloat = 14

    static func baseAttributes() -> [NSAttributedString.Key: Any] {
        [
            .font: NSFont.systemFont(ofSize: bodySize),
            .foregroundColor: NSColor.white,
            .paragraphStyle: paragraphStyle(kind: .paragraph, depth: 0),
        ]
    }

    /// Width of the marker gutter in front of a block's text.
    static func gutter(for kind: ParagraphKind) -> CGFloat {
        switch kind {
        case .bulleted, .numbered, .toDo, .toggle, .callout: return 26
        case .quote: return 16
        case .code: return 12
        default: return 0
        }
    }

    /// x where the block's text starts (container coordinates).
    static func contentX(kind: ParagraphKind, depth: Int) -> CGFloat {
        CGFloat(depth) * indentPerLevel + gutter(for: kind)
    }

    static func font(for kind: ParagraphKind) -> NSFont {
        switch kind {
        case .heading1: return .systemFont(ofSize: 24, weight: .semibold)
        case .heading2: return .systemFont(ofSize: 19, weight: .semibold)
        case .heading3: return .systemFont(ofSize: 16, weight: .semibold)
        case .code: return .monospacedSystemFont(ofSize: 13, weight: .regular)
        default: return .systemFont(ofSize: bodySize)
        }
    }

    private static var styleCache: [String: NSParagraphStyle] = [:]

    static func paragraphStyle(kind: ParagraphKind, depth: Int) -> NSParagraphStyle {
        let key = "\(kind.apiType)|\(depth)"
        if let cached = styleCache[key] { return cached }
        let style = NSMutableParagraphStyle()
        let indent = contentX(kind: kind, depth: depth)
        style.firstLineHeadIndent = indent
        style.headIndent = indent
        style.lineSpacing = 4
        style.paragraphSpacing = 4
        style.defaultTabInterval = 28
        style.tabStops = []
        switch kind {
        case .heading1: style.paragraphSpacingBefore = 14
        case .heading2: style.paragraphSpacingBefore = 10
        case .heading3: style.paragraphSpacingBefore = 6
        case .code:
            style.tailIndent = -12
            style.lineSpacing = 2
            style.paragraphSpacingBefore = 6
            style.paragraphSpacing = 10
        case .callout:
            style.tailIndent = -12
            style.paragraphSpacingBefore = 4
            style.paragraphSpacing = 8
        case .divider:
            style.paragraphSpacingBefore = 2
        default: break
        }
        styleCache[key] = style
        return style
    }

    // MARK: - Live styling (EditorDocument.styler)

    /// Styles every paragraph intersecting `range`. Attribute-only and without
    /// `beginEditing`/`endEditing`: it runs inside the text storage's `processEditing`.
    static func style(_ storage: NSTextStorage, range: NSRange) {
        let ns = storage.string as NSString
        guard ns.length > 0 else { return }
        var location = ns.paragraphRange(for: NSRange(location: min(max(range.location, 0), ns.length - 1), length: 0)).location
        let end = min(NSMaxRange(range), ns.length)
        repeat {
            var start = 0, paragraphEnd = 0, contentsEnd = 0
            ns.getParagraphStart(&start, end: &paragraphEnd, contentsEnd: &contentsEnd, for: NSRange(location: location, length: 0))
            styleParagraph(storage, full: NSRange(location: start, length: paragraphEnd - start), content: NSRange(location: start, length: contentsEnd - start))
            if paragraphEnd <= location { break }
            location = paragraphEnd
        } while location < end && location < ns.length
    }

    private static let visualKeys: [NSAttributedString.Key] = [.strikethroughStyle, .underlineStyle, .backgroundColor, .link, .baselineOffset]

    private static func styleParagraph(_ storage: NSTextStorage, full: NSRange, content: NSRange) {
        guard full.length > 0 else { return }
        let kind = ParagraphKind(tag: storage.attribute(.notionBlockKind, at: full.location, effectiveRange: nil) as? String ?? "") ?? .paragraph
        let depth = storage.attribute(.notionDepth, at: full.location, effectiveRange: nil) as? Int ?? 0
        let baseFont = font(for: kind)
        for key in visualKeys { storage.removeAttribute(key, range: full) }
        storage.addAttributes([
            .paragraphStyle: paragraphStyle(kind: kind, depth: depth),
            .font: baseFont,
            .foregroundColor: NSColor.white,
        ], range: full)
        if EditorDocument.tokenInfo(in: storage, range: full) != nil || content.length == 0 { return }

        let checked: Bool = { if case .toDo(true) = kind { return true }; return false }()
        if checked {
            storage.addAttributes([.foregroundColor: Theme.Color.secondaryNS, .strikethroughStyle: NSUnderlineStyle.single.rawValue], range: content)
        }
        if case .code = kind { return } // code blocks are plain monospace

        storage.enumerateAttributes(in: content, options: []) { attrs, run, _ in
            let bold = attrs[.notionBold] != nil
            let italic = attrs[.notionItalic] != nil
            let code = attrs[.notionCode] != nil
            if bold || italic || code {
                var runFont = code ? NSFont.monospacedSystemFont(ofSize: baseFont.pointSize - 1, weight: .regular) : baseFont
                if bold { runFont = NSFontManager.shared.convert(runFont, toHaveTrait: .boldFontMask) }
                if italic { runFont = NSFontManager.shared.convert(runFont, toHaveTrait: .italicFontMask) }
                storage.addAttribute(.font, value: runFont, range: run)
            }
            if code {
                storage.addAttributes([.backgroundColor: Theme.Color.sidebarNS, .foregroundColor: Theme.Color.inlineCodeNS], range: run)
            }
            if attrs[.notionStrike] != nil {
                storage.addAttribute(.strikethroughStyle, value: NSUnderlineStyle.single.rawValue, range: run)
            }
            if attrs[.notionLink] != nil {
                storage.addAttributes([.foregroundColor: Theme.Color.accentNS, .underlineStyle: NSUnderlineStyle.single.rawValue], range: run)
            }
        }
    }

    // MARK: - Placeholders

    static func placeholder(for kind: ParagraphKind) -> String? {
        switch kind {
        case .paragraph: return "Type '/' for commands"
        case .heading1: return "Heading 1"
        case .heading2: return "Heading 2"
        case .heading3: return "Heading 3"
        case .toDo: return "To-do"
        case .bulleted, .numbered: return "List"
        case .quote: return "Quote"
        case .toggle: return "Toggle"
        case .callout: return "Callout"
        case .code: return "Code"
        default: return nil
        }
    }

    // MARK: - Guards

    /// True if `replacement` at `range` would put characters into a token chip's or divider's line.
    static func wouldTypeIntoAtomicBlock(_ document: EditorDocument, range: NSRange, replacement: String) -> Bool {
        guard replacement.contains(where: { $0 != "\n" }) else { return false }
        let paragraph = document.paragraphRange(at: range.location)
        let kind = document.kind(at: range.location)
        guard kind.isToken || kind.isImage || kind == .divider else { return false }
        // Replacing the whole line (e.g. selecting and pasting over it) is fine.
        return !(range.location <= paragraph.content.location && NSMaxRange(range) >= NSMaxRange(paragraph.content) && paragraph.content.length > 0)
    }
}

extension Theme.Color {
    static var tertiaryNS: NSColor { NSColor(white: 1, alpha: 0.32) }
    static var secondaryNS: NSColor { NSColor(hex: 0x808080) }
    /// The (user-configurable) accent, bridged for AppKit drawing.
    static var accentNS: NSColor { NSColor(Theme.Color.accent) }
    static var sidebarNS: NSColor { NSColor(hex: 0x1C1C1E) }
    static var inlineCodeNS: NSColor { NSColor(hex: 0xFF7B72) }
}
