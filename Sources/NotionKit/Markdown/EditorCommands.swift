import AppKit

/// What the editing commands need from the text view (implemented by the app's NSTextView, and
/// by a plain host in tests). Text replacements must be undoable the way typing is.
@MainActor
public protocol EditorHost: AnyObject {
    var editorSelection: NSRange { get }
    func setEditorSelection(_ range: NSRange)
    var editorTypingAttributes: [NSAttributedString.Key: Any] { get set }
    var editorUndoManager: UndoManager? { get }
    /// Undoable replacement (NSTextView: shouldChangeText → replace → didChangeText).
    @discardableResult func editorReplace(_ range: NSRange, with string: NSAttributedString) -> Bool
    /// Ends NSTextView's typing coalescing, so the next change is its own undo step.
    func editorBreakUndoCoalescing()
}

/// Notion-style editing on top of `EditorDocument`: Markdown typed at the start of a line or
/// around text converts on the spot (markers removed, kind/formatting set as attributes, one undo
/// step), Enter/Backspace/Tab behave like Notion, and paste/copy speak Markdown.
@MainActor
public final class EditorCommands {
    public let document: EditorDocument
    public weak var host: EditorHost?

    public init(document: EditorDocument, host: EditorHost? = nil) {
        self.document = document
        self.host = host
    }

    private var storage: NSTextStorage { document.storage }
    private var ns: NSString { storage.string as NSString }

    private var isUndoingOrRedoing: Bool {
        guard let undo = host?.editorUndoManager else { return false }
        return undo.isUndoing || undo.isRedoing
    }

    // MARK: - Undo plumbing

    /// Runs `body` as its own undo step.
    func undoStep(_ name: String, _ body: () -> Void) {
        host?.editorBreakUndoCoalescing()
        let undo = host?.editorUndoManager
        undo?.beginUndoGrouping()
        body()
        undo?.setActionName(name)
        undo?.endUndoGrouping()
        host?.editorBreakUndoCoalescing()
    }

    /// `document.setStyle` + an undo action that restores the old style (by local id).
    public func setStyle(kind: ParagraphKind? = nil, depth: Int? = nil, at location: Int) {
        guard let localID = document.localID(at: location),
              let old = document.setStyle(kind: kind, depth: depth, forParagraphAt: location) else { return }
        registerStyleUndo(localID: localID, kind: old.kind, depth: old.depth)
    }

    private func registerStyleUndo(localID: String, kind: ParagraphKind, depth: Int) {
        host?.editorUndoManager?.registerUndo(withTarget: document) { [weak self] document in
            MainActor.assumeIsolated {
                guard let location = document.location(ofLocalID: localID) else { return }
                let current = (document.kind(at: location), document.depth(at: location))
                if document.setStyle(kind: kind, depth: depth, forParagraphAt: location) != nil {
                    self?.registerStyleUndo(localID: localID, kind: current.0, depth: current.1)
                }
            }
        }
    }

    private func replace(_ range: NSRange, with string: String, attributes: [NSAttributedString.Key: Any]? = nil) {
        let attrs = attributes ?? host?.editorTypingAttributes ?? document.baseAttributes
        replace(range, with: NSAttributedString(string: string, attributes: attrs))
    }

    func replace(_ range: NSRange, with string: NSAttributedString) {
        if let host {
            host.editorReplace(range, with: string)
        } else {
            storage.replaceCharacters(in: range, with: string)
        }
    }

    func select(_ location: Int) {
        host?.setEditorSelection(NSRange(location: max(0, min(location, storage.length)), length: 0))
    }

    private var caret: Int { host?.editorSelection.location ?? 0 }

    // MARK: - Typing

    /// Call after text was typed (not pasted) at the caret: converts a just-completed block
    /// shortcut ("# ", "- ", "[] ", …) or inline run ("**b**", "`c`", …).
    public func didInsertText(_ inserted: String) {
        guard !isUndoingOrRedoing, let host, host.editorSelection.length == 0, !inserted.isEmpty else { return }
        if convertBlockShortcut() { return }
        if let last = inserted.last, "*_~`)".contains(last) { _ = convertInlineShortcut() }
    }

    /// "# " at a paragraph start → heading, etc. (See `BlockShortcut`.)
    @discardableResult
    public func convertBlockShortcut() -> Bool {
        let caret = self.caret
        let paragraph = document.paragraphRange(at: caret)
        let typedRange = NSRange(location: paragraph.content.location, length: caret - paragraph.content.location)
        guard typedRange.length > 0, typedRange.length <= 6 else { return false }
        let current = document.kind(at: caret)
        guard let target = BlockShortcut.kind(forTyped: ns.substring(with: typedRange), current: current) else { return false }
        undoStep("Format") {
            replace(typedRange, with: "")
            setStyle(kind: target, at: typedRange.location)
            select(typedRange.location)
        }
        return true
    }

    /// "**bold**" → bold run, etc. (See `InlineShortcut`.) Unmatched markers are left alone.
    @discardableResult
    public func convertInlineShortcut() -> Bool {
        let caret = self.caret
        let paragraph = document.paragraphRange(at: caret)
        let kind = document.kind(at: caret)
        guard kind.hasText else { return false }
        if case .code = kind { return false }
        let before = NSRange(location: paragraph.content.location, length: caret - paragraph.content.location)
        guard before.length > 0, let match = InlineShortcut.match(endingAt: ns.substring(with: before)) else { return false }
        let whole = NSRange(location: before.location + match.whole.location, length: match.whole.length)
        let inner = NSRange(location: before.location + match.inner.location, length: match.inner.length)
        // Don't convert inside inline code.
        if storage.attribute(.notionCode, at: inner.location, effectiveRange: nil) != nil { return false }
        let replacement = NSMutableAttributedString(attributedString: storage.attributedSubstring(from: inner))
        let full = NSRange(location: 0, length: replacement.length)
        switch match.style {
        case .bold: replacement.addAttribute(.notionBold, value: true, range: full)
        case .italic: replacement.addAttribute(.notionItalic, value: true, range: full)
        case .strikethrough: replacement.addAttribute(.notionStrike, value: true, range: full)
        case .code: replacement.addAttribute(.notionCode, value: true, range: full)
        case .link(let url): replacement.addAttribute(.notionLink, value: url, range: full)
        }
        undoStep("Format") {
            replace(whole, with: replacement)
            select(whole.location + replacement.length)
        }
        // Typing continues unformatted after the converted run (Notion behaviour).
        if var typing = host?.editorTypingAttributes {
            for key in NSAttributedString.Key.notionInlineKeys { typing.removeValue(forKey: key) }
            host?.editorTypingAttributes = typing
        }
        return true
    }

    // MARK: - Enter / Shift-Enter

    /// The kind Enter continues with after a paragraph of `kind`.
    public static func continuation(of kind: ParagraphKind) -> ParagraphKind {
        switch kind {
        case .toDo: return .toDo(checked: false)
        case .bulleted, .numbered, .quote, .toggle: return kind
        default: return .paragraph
        }
    }

    /// Enter, Notion-style. Returns false when the default newline should run (tokens).
    @discardableResult
    public func insertNewline() -> Bool {
        guard let host else { return false }
        var selection = host.editorSelection
        let kind = document.kind(at: selection.location)
        if kind.isToken { return false }
        if kind.isImage {
            // Enter on a picture: a new text line below it.
            undoStep("Typing") {
                insertParagraph(after: document.paragraphRange(at: selection.location), kind: .paragraph, depth: document.depth(at: selection.location))
            }
            return true
        }
        undoStep("Typing") {
            if selection.length > 0 {
                replace(selection, with: "")
                selection = NSRange(location: selection.location, length: 0)
            }
            let caret = selection.location
            let paragraph = document.paragraphRange(at: caret)
            let content = paragraph.content
            let offset = caret - content.location
            let depth = document.depth(at: caret)
            let text = ns.substring(with: content)

            switch kind {
            case .code:
                // Enter on an empty last code line leaves the block; otherwise a line break.
                if caret == NSMaxRange(content), text.hasSuffix(ParagraphSyntax.softBreakString) {
                    replace(NSRange(location: caret - 1, length: 1), with: "\n")
                    setStyle(kind: .paragraph, depth: depth, at: caret)
                    select(caret)
                } else {
                    replace(selection, with: ParagraphSyntax.softBreakString)
                    select(caret + 1)
                }
                return
            case .divider:
                insertParagraph(after: paragraph, kind: .paragraph, depth: depth)
                return
            default:
                break
            }

            if kind == .paragraph, text == "---", offset == content.length {
                // "---" + Enter → divider, caret on a new line below.
                replace(content, with: "")
                setStyle(kind: .divider, at: content.location)
                insertParagraph(after: document.paragraphRange(at: content.location), kind: .paragraph, depth: depth)
                return
            }
            if content.length == 0 {
                switch kind {
                case .bulleted, .numbered, .toDo, .quote, .toggle, .callout:
                    // Enter on an empty item leaves the list: it becomes a plain paragraph.
                    setStyle(kind: .paragraph, at: caret)
                    return
                default:
                    break
                }
            }
            if kind == .toggle, offset == content.length, !document.isCollapsed(paragraphAt: caret) {
                // End of an open toggle: its first child.
                replace(NSRange(location: caret, length: 0), with: "\n", attributes: newlineAttributes())
                setStyle(kind: .paragraph, depth: depth + 1, at: caret + 1)
                select(caret + 1)
                return
            }
            let next = Self.continuation(of: kind)
            if offset == 0, content.length > 0 {
                // Enter at the start: an empty block above; this block moves down unchanged.
                replace(NSRange(location: caret, length: 0), with: "\n", attributes: newlineAttributes())
                setStyle(kind: next, depth: depth, at: caret)
                select(caret + 1)
                return
            }
            replace(NSRange(location: caret, length: 0), with: "\n", attributes: newlineAttributes())
            setStyle(kind: next, depth: depth, at: caret + 1)
            select(caret + 1)
        }
        return true
    }

    /// Attributes for an inserted paragraph break (identity comes from normalization).
    private func newlineAttributes() -> [NSAttributedString.Key: Any] {
        var attrs = host?.editorTypingAttributes ?? document.baseAttributes
        for key in NSAttributedString.Key.notionInlineKeys { attrs.removeValue(forKey: key) }
        return attrs
    }

    private func insertParagraph(after paragraph: (range: NSRange, content: NSRange), kind: ParagraphKind, depth: Int) {
        let at = NSMaxRange(paragraph.content)
        replace(NSRange(location: at, length: 0), with: "\n", attributes: newlineAttributes())
        setStyle(kind: kind, depth: depth, at: at + 1)
        select(at + 1)
    }

    // MARK: - Backspace

    /// Backspace at the very start of a block: a non-paragraph first becomes a paragraph (text
    /// kept), a nested paragraph outdents, a divider above is removed; otherwise the default
    /// (merge with the line above) runs. Returns true if handled.
    @discardableResult
    public func deleteBackward() -> Bool {
        guard let host else { return false }
        let selection = host.editorSelection
        if deleteImage(at: selection) { return true }
        guard selection.length == 0 else { return false }
        let paragraph = document.paragraphRange(at: selection.location)
        guard selection.location == paragraph.content.location else { return false }
        let kind = document.kind(at: selection.location)
        if kind.isToken { return false }
        if kind != .paragraph {
            undoStep("Format") { setStyle(kind: .paragraph, at: selection.location) }
            return true
        }
        let depth = document.depth(at: selection.location)
        if depth > 0 {
            undoStep("Outdent") { setStyle(depth: depth - 1, at: selection.location) }
            return true
        }
        if paragraph.range.location > 0 {
            let previous = document.paragraphRange(at: paragraph.range.location - 1)
            let previousKind = document.kind(at: previous.range.location)
            if previousKind == .divider {
                undoStep("Delete") {
                    replace(previous.range, with: "")
                    select(previous.range.location)
                }
                return true
            }
            if previousKind.isToken { return true } // chips can't absorb text
            if previousKind.isImage {
                // Like Notion: the first Backspace selects the picture, the next deletes it.
                host.setEditorSelection(previous.content)
                return true
            }
        }
        return false
    }

    // MARK: - Tab / Shift-Tab

    /// Indents/outdents the selected paragraphs (depth ≤ previous paragraph's + 1, ≤ 3).
    @discardableResult
    public func indent(outdent: Bool) -> Bool {
        guard let host else { return false }
        let selection = host.editorSelection
        if case .code = document.kind(at: selection.location) { return false }
        let first = document.paragraphRange(at: selection.location).range
        var locations = [first.location]
        if selection.length > 0, first.length > 0 {
            var location = NSMaxRange(first)
            while location < NSMaxRange(selection) {
                locations.append(location)
                let range = document.paragraphRange(at: location).range
                guard range.length > 0 else { break }
                location = NSMaxRange(range)
            }
        }
        undoStep(outdent ? "Outdent" : "Indent") {
            for start in locations {
                let depth = document.depth(at: start)
                if outdent {
                    if depth > 0 { setStyle(depth: depth - 1, at: start) }
                } else {
                    let previousDepth = start > 0 ? document.depth(at: start - 1) : -1
                    if depth < ParagraphSyntax.maxDepth, depth <= previousDepth { setStyle(depth: depth + 1, at: start) }
                }
            }
        }
        return true
    }

    // MARK: - Checkbox

    public func toggleCheckbox(paragraphAt location: Int) {
        guard case .toDo(let checked) = document.kind(at: location) else { return }
        undoStep(checked ? "Uncheck" : "Check") { setStyle(kind: .toDo(checked: !checked), at: location) }
    }

    // MARK: - Inline formatting (⌘B / ⌘I / ⌘E / ⌘⇧X / ⌘K)

    public enum Mark { case bold, italic, strikethrough, code }

    private func key(for mark: Mark) -> NSAttributedString.Key {
        switch mark {
        case .bold: return .notionBold
        case .italic: return .notionItalic
        case .strikethrough: return .notionStrike
        case .code: return .notionCode
        }
    }

    /// Toggles a mark on the selection (all marked → remove, else add); with no selection, toggles
    /// it for what's typed next.
    public func toggle(_ mark: Mark) {
        guard let host else { return }
        let selection = host.editorSelection
        let attribute = key(for: mark)
        if selection.length == 0 {
            var typing = host.editorTypingAttributes
            if typing[attribute] != nil { typing.removeValue(forKey: attribute) } else { typing[attribute] = true }
            host.editorTypingAttributes = typing
            return
        }
        var allMarked = true
        storage.enumerateAttribute(attribute, in: selection, options: []) { value, run, stop in
            let isText = !(ns.substring(with: run).allSatisfy { $0 == "\n" })
            if value == nil, isText { allMarked = false; stop.pointee = true }
        }
        restyleSelection(selection, name: "Format") { copy, range in
            if allMarked { copy.removeAttribute(attribute, range: range) } else { copy.addAttribute(attribute, value: true, range: range) }
        }
    }

    /// Sets (or with nil, removes) a link on the selection.
    public func setLink(_ url: URL?, range: NSRange) {
        guard range.length > 0 else { return }
        restyleSelection(range, name: "Link") { copy, full in
            if let url { copy.addAttribute(.notionLink, value: url, range: full) } else { copy.removeAttribute(.notionLink, range: full) }
        }
    }

    /// Applies an attribute change to `range` as an undoable text replacement with the same
    /// characters (so it's tracked, undone and synced like any edit).
    private func restyleSelection(_ range: NSRange, name: String, _ change: (NSMutableAttributedString, NSRange) -> Void) {
        let copy = NSMutableAttributedString(attributedString: storage.attributedSubstring(from: range))
        // Paragraph breaks keep only paragraph attributes.
        change(copy, NSRange(location: 0, length: copy.length))
        let text = copy.string as NSString
        for i in 0..<text.length where text.character(at: i) == 0x0A {
            for key in NSAttributedString.Key.notionInlineKeys { copy.removeAttribute(key, range: NSRange(location: i, length: 1)) }
        }
        undoStep(name) {
            replace(range, with: copy)
            host?.setEditorSelection(range)
        }
    }

    // MARK: - Paste / copy

    /// Pastes (Markdown) text: lines become blocks with their kinds, inline Markdown becomes
    /// formatting. The first line joins the current block (taking its kind if the block is empty).
    public func paste(_ text: String) {
        guard let host else { return }
        let blocks = MarkdownImport.blocks(from: text)
        guard !blocks.isEmpty else { return }
        let selection = host.editorSelection
        let baseDepth = document.depth(at: selection.location)
        let currentKind = document.kind(at: selection.location)
        let targetWasEmpty: Bool = {
            let paragraph = document.paragraphRange(at: selection.location)
            return paragraph.content.length == selection.length && paragraph.content.location == selection.location
        }()

        let insertion = NSMutableAttributedString()
        var inline = host.editorTypingAttributes
        for key in NSAttributedString.Key.notionParagraphKeys + NSAttributedString.Key.notionInlineKeys { inline.removeValue(forKey: key) }
        var lineStarts: [Int] = []
        for (index, block) in blocks.enumerated() {
            var attrs = inline
            if index > 0 {
                insertion.append(NSAttributedString(string: "\n", attributes: attrs))
                // Later lines are new paragraphs with their own (unique) identity.
                attrs[.notionLocalID] = UUID().uuidString
            }
            lineStarts.append(insertion.length)
            insertion.append(EditorDocument.attributedContent(block.spans, kind: block.kind, attributes: attrs))
        }

        undoStep("Paste") {
            replace(selection, with: insertion)
            select(selection.location + insertion.length)
            for (index, block) in blocks.enumerated() {
                if index == 0 && !(targetWasEmpty && currentKind == .paragraph) { continue }
                setStyle(kind: block.kind, depth: min(baseDepth + block.depth, ParagraphSyntax.maxDepth), at: selection.location + lineStarts[index])
            }
        }
    }

    /// Markdown for `range` (copy/cut put this on the pasteboard as plain text).
    public func markdown(for range: NSRange) -> String {
        guard range.length > 0 else { return "" }
        var parts: [(kind: ParagraphKind, depth: Int, spans: [RichTextSpan])] = []
        var location = document.paragraphRange(at: range.location).range.location
        while location < NSMaxRange(range) {
            let paragraph = document.paragraphRange(at: location)
            let piece = NSIntersectionRange(paragraph.content, range)
            let kind = document.kind(at: location)
            let spans: [RichTextSpan]
            if case .code = kind {
                spans = [RichTextSpan(text: ParagraphSyntax.fromSoftBreaks(ns.substring(with: piece)))]
            } else {
                spans = EditorDocument.spans(in: storage, range: piece)
            }
            parts.append((kind, document.depth(at: location), spans))
            guard paragraph.range.length > 0 else { break }
            location = NSMaxRange(paragraph.range)
        }
        return MarkdownExport.markdown(parts)
    }

    // MARK: - Slash menu

    /// Removes "/query" (from the "/" to the caret) and turns the block into `command`'s kind as
    /// one undo step.
    public func applySlash(_ command: SlashCommand, slashLocation: Int) {
        guard let host else { return }
        let caret = max(host.editorSelection.location, slashLocation + 1)
        let paragraph = document.paragraphRange(at: slashLocation)
        let end = min(caret, NSMaxRange(paragraph.content))
        let current = document.kind(at: slashLocation)
        let depth = document.depth(at: slashLocation)
        undoStep("Turn Into") {
            replace(NSRange(location: slashLocation, length: end - slashLocation), with: "")
            select(slashLocation)
            let target = command.kind(from: current)
            if target == .divider {
                let now = document.paragraphRange(at: slashLocation)
                if now.content.length == 0 {
                    setStyle(kind: .divider, at: slashLocation)
                    insertParagraph(after: now, kind: .paragraph, depth: depth)
                } else {
                    // Keep the text: the divider goes on its own line below it.
                    insertParagraph(after: now, kind: .divider, depth: depth)
                    insertParagraph(after: document.paragraphRange(at: host.editorSelection.location), kind: .paragraph, depth: depth)
                }
            } else {
                setStyle(kind: target, at: slashLocation)
            }
        }
    }
}
