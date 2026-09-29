import AppKit
import NotionKit

/// The page editor's NSTextView: routes Notion-style keys to `EditorCommands`, guards atomic
/// blocks (chips, dividers), and draws block markers in the left inset (see +Gutter).
final class EditorTextView: NSTextView {
    weak var document: EditorDocument?
    var commands: EditorCommands?
    weak var find: EditorFindController?
    var slash: SlashMenuController?
    /// Set while `EditorCommands` edits, so the atomic-block guard lets it through.
    var isCommandEdit = false
    /// Checkbox fill animations: paragraph local id → start time.
    var checkAnimations: [String: Date] = [:]
    var animationTimer: Timer?
    /// Uploads a pasted/dropped image as a block after the paragraph at the given location.
    var onInsertImage: ((PastedImage, Int) -> Void)?
    /// Drag handle: the paragraph under the mouse, and an in-progress drag (see +DragHandle).
    var hoveredParagraph: Int?
    var blockDrag: BlockDrag?
    var hoverTrackingArea: NSTrackingArea?
    private var storageObserver: NSObjectProtocol?

    // MARK: - Redraw when the storage changes (markers, numbering, placeholders)

    func startObservingStorage() {
        guard storageObserver == nil, let storage = textStorage else { return }
        storageObserver = NotificationCenter.default.addObserver(forName: NSTextStorage.didProcessEditingNotification, object: storage, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.needsDisplay = true }
        }
    }

    func stopObservingStorage() {
        if let storageObserver { NotificationCenter.default.removeObserver(storageObserver) }
        storageObserver = nil
    }

    // MARK: - Guards

    override func shouldChangeText(in affectedCharRange: NSRange, replacementString: String?) -> Bool {
        if !isCommandEdit, document?.isProgrammaticEdit != true, let replacementString, let document,
           EditorStyling.wouldTypeIntoAtomicBlock(document, range: affectedCharRange, replacement: replacementString) {
            NSSound.beep()
            return false
        }
        return super.shouldChangeText(in: affectedCharRange, replacementString: replacementString)
    }

    // MARK: - Typing → shortcuts

    override func insertText(_ string: Any, replacementRange: NSRange) {
        refreshTypingStyle()
        super.insertText(string, replacementRange: replacementRange)
        guard !hasMarkedText() else { return }
        let typed = (string as? String) ?? (string as? NSAttributedString)?.string ?? ""
        commands?.didInsertText(typed)
    }

    override func insertNewline(_ sender: Any?) {
        if commands?.insertNewline() == true { return }
        super.insertNewline(sender)
    }

    override func deleteBackward(_ sender: Any?) {
        if commands?.deleteBackward() == true { return }
        super.deleteBackward(sender)
    }

    override func deleteForward(_ sender: Any?) {
        if commands?.deleteForward() == true { return }
        super.deleteForward(sender)
    }

    // ⌥⇧↑ / ⌥⇧↓ (the standard bindings for these selectors): move the block with its children.
    override func moveParagraphBackwardAndModifySelection(_ sender: Any?) {
        if isEditable, commands?.moveBlockUp() == true { scrollRangeToVisible(selectedRange()); return }
        NSSound.beep()
    }

    override func moveParagraphForwardAndModifySelection(_ sender: Any?) {
        if isEditable, commands?.moveBlockDown() == true { scrollRangeToVisible(selectedRange()); return }
        NSSound.beep()
    }

    override func insertTab(_ sender: Any?) {
        if commands?.indent(outdent: false) == true { return }
        super.insertTab(sender)
    }

    override func insertBacktab(_ sender: Any?) {
        if commands?.indent(outdent: true) == true { return }
        super.insertBacktab(sender)
    }

    override func cancelOperation(_ sender: Any?) {
        if slash?.isOpen == true { slash?.close(); return }
        if find?.isVisible == true { find?.close(); return }
        super.cancelOperation(sender)
    }

    // MARK: - ⌘ shortcuts

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        guard event.modifierFlags.contains(.command), window?.firstResponder === self else {
            return super.performKeyEquivalent(with: event)
        }
        let shift = event.modifierFlags.contains(.shift)
        switch (event.charactersIgnoringModifiers?.lowercased(), shift) {
        case ("b", false): commands?.toggle(.bold); return true
        case ("i", false): commands?.toggle(.italic); return true
        case ("e", false): commands?.toggle(.code); return true
        case ("x", true): commands?.toggle(.strikethrough); return true
        case ("k", false): showLinkPopover(); return true
        case ("f", false): find?.perform(.showFindPanel); return find != nil
        case ("g", _): find?.perform(shift ? .previous : .next); return find != nil
        default: return super.performKeyEquivalent(with: event)
        }
    }

    // MARK: - Find (menu ⌘F / ⌘G / ⇧⌘G → the page's find bar)

    override func performFindPanelAction(_ sender: Any?) {
        let tag = (sender as? NSValidatedUserInterfaceItem)?.tag ?? 1
        find?.perform(NSFindPanelAction(rawValue: UInt(max(tag, 1))) ?? .showFindPanel)
    }

    override func validateUserInterfaceItem(_ item: NSValidatedUserInterfaceItem) -> Bool {
        if item.action == #selector(performFindPanelAction(_:)) { return find != nil }
        return super.validateUserInterfaceItem(item)
    }
}

// MARK: - EditorHost

extension EditorTextView: EditorHost {
    var editorSelection: NSRange { selectedRange() }

    func setEditorSelection(_ range: NSRange) {
        setSelectedRange(range)
    }

    var editorTypingAttributes: [NSAttributedString.Key: Any] {
        get { typingAttributes }
        set { typingAttributes = newValue }
    }

    var editorUndoManager: UndoManager? { undoManager }

    @discardableResult
    func editorReplace(_ range: NSRange, with string: NSAttributedString) -> Bool {
        isCommandEdit = true
        defer { isCommandEdit = false }
        guard let textStorage, shouldChangeText(in: range, replacementString: string.string) else { return false }
        textStorage.replaceCharacters(in: range, with: string)
        didChangeText()
        return true
    }

    func editorBreakUndoCoalescing() {
        breakUndoCoalescing()
    }
}
