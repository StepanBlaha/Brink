import AppKit
import SwiftUI
import NotionKit

/// A Notion-style WYSIWYG editor over a `NotionKit.EditorDocument`: ONE PARAGRAPH == ONE NOTION
/// BLOCK, and the text holds only content. Markdown is just an input shortcut (handled by
/// `EditorCommands`); kinds, depth and inline formatting are attributes, and markers are drawn in
/// the left inset. The NSTextView is attached directly to the document's `NSTextStorage`, whose
/// delegate tracks block identity on every edit and notifies the sync engine.
struct MarkdownEditorView: NSViewRepresentable {
    let document: EditorDocument
    let find: EditorFindController
    var isEditable: Bool
    var onOpenToken: (String) -> Void
    var onInsertImage: (PastedImage, Int) -> Void = { _, _ in }
    var makeFirstResponderOnAppear: Bool = true

    func makeNSView(context: Context) -> NSScrollView {
        let layoutManager = NSLayoutManager()
        document.storage.addLayoutManager(layoutManager)
        let container = NSTextContainer(size: NSSize(width: 0, height: CGFloat.greatestFiniteMagnitude))
        container.widthTracksTextView = true
        container.lineFragmentPadding = 0
        layoutManager.addTextContainer(container)
        layoutManager.delegate = context.coordinator

        let textView = EditorTextView(frame: NSRect(x: 0, y: 0, width: 360, height: 200), textContainer: container)
        textView.document = document
        textView.commands = EditorCommands(document: document, host: textView)
        textView.delegate = context.coordinator
        textView.isEditable = isEditable
        textView.isSelectable = true
        textView.isRichText = true
        textView.importsGraphics = false
        textView.drawsBackground = false
        textView.backgroundColor = .clear
        textView.focusRingType = .none
        textView.allowsUndo = true
        // Wider than the text needs: the ⋮⋮ drag handle sits left of a top-level block's marker.
        textView.textContainerInset = NSSize(width: EditorTextView.handleGutter, height: 12)
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.isAutomaticSpellingCorrectionEnabled = false
        textView.isAutomaticLinkDetectionEnabled = false
        textView.insertionPointColor = .white
        textView.selectedTextAttributes = [.backgroundColor: NSColor.white.withAlphaComponent(0.25)]
        textView.typingAttributes = EditorStyling.baseAttributes()
        textView.minSize = NSSize(width: 0, height: 0)
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.find = find
        textView.slash = SlashMenuController(textView: textView)
        find.textView = textView
        textView.startObservingStorage()

        let scrollView = NSScrollView()
        scrollView.documentView = textView
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.drawsBackground = false
        scrollView.backgroundColor = .clear
        scrollView.borderType = .noBorder

        document.textView = textView
        context.coordinator.textView = textView
        context.coordinator.onOpenToken = onOpenToken
        textView.onInsertImage = onInsertImage
        textView.registerForDraggedTypes(textView.acceptableDragTypes)

        if makeFirstResponderOnAppear {
            DispatchQueue.main.async {
                scrollView.window?.makeFirstResponder(textView)
            }
        }
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        context.coordinator.onOpenToken = onOpenToken
        guard let textView = context.coordinator.textView else { return }
        textView.onInsertImage = onInsertImage
        if textView.isEditable != isEditable { textView.isEditable = isEditable }
        if document.textView !== textView { document.textView = textView }
    }

    /// The document (and its storage) outlives this view: detach this view's layout manager so a
    /// reopened panel doesn't leave stale ones laying out the same text.
    static func dismantleNSView(_ scrollView: NSScrollView, coordinator: Coordinator) {
        guard let textView = coordinator.textView, let layoutManager = textView.layoutManager else { return }
        textView.slash?.close()
        textView.stopObservingStorage()
        textView.textStorage?.removeLayoutManager(layoutManager)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator: NSObject, NSTextViewDelegate, NSLayoutManagerDelegate {
        weak var textView: EditorTextView?
        var onOpenToken: (String) -> Void = { _ in }

        func textView(_ textView: NSTextView, shouldChangeTextIn affectedCharRange: NSRange, replacementString: String?) -> Bool {
            (textView as? EditorTextView)?.slash?.willChangeText(replacement: replacementString)
            return true
        }

        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? EditorTextView else { return }
            textView.slash?.textDidChange()
            textView.find?.textDidChange()
            // Attribute-only changes (e.g. undo of formatting) are local edits too.
            if textView.undoManager?.isUndoing == true || textView.undoManager?.isRedoing == true {
                textView.document?.noteLocalEdit(restyling: NSRange(location: 0, length: textView.textStorage?.length ?? 0))
            }
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard let textView = notification.object as? EditorTextView else { return }
            textView.slash?.selectionDidChange()
            textView.needsDisplay = true // placeholder follows the caret
        }

        /// ↑↓ ⏎ Esc go to the slash menu while it's open.
        func textView(_ textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
            (textView as? EditorTextView)?.slash?.handle(commandSelector) ?? false
        }

        /// Clicking a token chip opens that block in Notion.
        func textView(_ textView: NSTextView, clickedOn cell: NSTextAttachmentCellProtocol, in cellFrame: NSRect, at charIndex: Int) {
            guard let storage = textView.textStorage, charIndex < storage.length,
                  let encoded = storage.attribute(.notionToken, at: charIndex, effectiveRange: nil) as? String else { return }
            let blockID = encoded.components(separatedBy: "\u{1F}").first ?? ""
            if !blockID.isEmpty { onOpenToken(blockID) }
        }

        // MARK: Collapsed toggles: hidden paragraphs get null glyphs and zero-height lines.

        func layoutManager(_ layoutManager: NSLayoutManager, shouldGenerateGlyphs glyphs: UnsafePointer<CGGlyph>, properties props: UnsafePointer<NSLayoutManager.GlyphProperty>, characterIndexes charIndexes: UnsafePointer<Int>, font aFont: NSFont, forGlyphRange glyphRange: NSRange) -> Int {
            guard let storage = layoutManager.textStorage, glyphRange.length > 0 else { return 0 }
            var anyHidden = false
            var properties = [NSLayoutManager.GlyphProperty](repeating: [], count: glyphRange.length)
            for i in 0..<glyphRange.length {
                properties[i] = props[i]
                let charIndex = charIndexes[i]
                if charIndex < storage.length, storage.attribute(.notionHidden, at: charIndex, effectiveRange: nil) != nil {
                    properties[i] = .null
                    anyHidden = true
                }
            }
            guard anyHidden else { return 0 }
            properties.withUnsafeBufferPointer { buffer in
                layoutManager.setGlyphs(glyphs, properties: buffer.baseAddress!, characterIndexes: charIndexes, font: aFont, forGlyphRange: glyphRange)
            }
            return glyphRange.length
        }

        func layoutManager(_ layoutManager: NSLayoutManager, shouldSetLineFragmentRect lineFragmentRect: UnsafeMutablePointer<NSRect>, lineFragmentUsedRect: UnsafeMutablePointer<NSRect>, baselineOffset: UnsafeMutablePointer<CGFloat>, in textContainer: NSTextContainer, forGlyphRange glyphRange: NSRange) -> Bool {
            guard let storage = layoutManager.textStorage else { return false }
            let chars = layoutManager.characterRange(forGlyphRange: glyphRange, actualGlyphRange: nil)
            guard chars.length > 0, chars.location < storage.length else { return false }
            var effective = NSRange()
            guard storage.attribute(.notionHidden, at: chars.location, longestEffectiveRange: &effective, in: NSRange(location: 0, length: storage.length)) != nil,
                  NSMaxRange(effective) >= NSMaxRange(chars) else { return false }
            lineFragmentRect.pointee.size.height = 0
            lineFragmentUsedRect.pointee.size.height = 0
            baselineOffset.pointee = 0
            return true
        }
    }
}

// MARK: - Token chip attachment

final class TokenAttachment: NSTextAttachment {
    let info: TokenInfo

    init(info: TokenInfo) {
        self.info = info
        super.init(data: nil, ofType: nil)
        image = TokenAttachment.chipImage(kind: info.type, title: info.title)
        let size = image?.size ?? .zero
        bounds = CGRect(x: 0, y: -4, width: size.width, height: size.height)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    private static func icon(for kind: String) -> String {
        switch kind {
        case "child_database": return "▦"
        case "child_page": return "📄"
        case "toggle": return "▸"
        case "callout": return "💡"
        case "image": return "🖼"
        default: return "▪︎"
        }
    }

    private static func chipImage(kind: String, title: String) -> NSImage {
        let label = "\(icon(for: kind))  \(title.isEmpty ? "Untitled" : title)"
        let font = NSFont.systemFont(ofSize: 13, weight: .medium)
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white]
        let textSize = (label as NSString).size(withAttributes: attrs)
        let hPad: CGFloat = 10, vPad: CGFloat = 5
        let size = NSSize(width: ceil(textSize.width + hPad * 2), height: ceil(textSize.height + vPad * 2))
        return NSImage(size: size, flipped: false) { rect in
            NSColor(white: 1, alpha: 0.08).setFill()
            NSBezierPath(roundedRect: rect, xRadius: 6, yRadius: 6).fill()
            (label as NSString).draw(at: NSPoint(x: hPad, y: vPad), withAttributes: attrs)
            return true
        }
    }
}
