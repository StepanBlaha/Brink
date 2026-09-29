import AppKit
@testable import NotionKit

/// Stands in for the NSTextView in tests: undoable replacements on the document's storage (the
/// same storage-delegate path as typing), a caret, typing attributes and an UndoManager.
@MainActor
final class TestEditorHost: EditorHost {
    let document: EditorDocument
    lazy var commands = EditorCommands(document: document, host: self)
    let undo = UndoManager()
    var selection = NSRange(location: 0, length: 0)
    var typing: [NSAttributedString.Key: Any] = [:]

    /// Set when commands assign typing attributes (NSTextView keeps them until the caret moves).
    private var typingOverride = false

    init(_ blocks: [SyncedParagraph] = []) {
        document = EditorDocument()
        document.load(blocks, preserveSelection: false)
        undo.groupsByEvent = false
    }

    init(document: EditorDocument) {
        self.document = document
        undo.groupsByEvent = false
    }

    var editorSelection: NSRange { selection }
    func setEditorSelection(_ range: NSRange) { selection = range }
    var editorTypingAttributes: [NSAttributedString.Key: Any] {
        get { typing }
        set { typing = newValue; typingOverride = true }
    }
    var editorUndoManager: UndoManager? { undo }
    func editorBreakUndoCoalescing() {}

    @discardableResult
    func editorReplace(_ range: NSRange, with string: NSAttributedString) -> Bool {
        let old = document.storage.attributedSubstring(from: range)
        document.storage.replaceCharacters(in: range, with: string)
        let inserted = NSRange(location: range.location, length: string.length)
        undo.registerUndo(withTarget: self) { host in
            MainActor.assumeIsolated { _ = host.editorReplace(inserted, with: old) }
        }
        return true
    }

    // MARK: - Simulated keyboard

    /// Types `text` one character at a time at the caret, like keystrokes (each its own undo
    /// step), running the same shortcut hook as the text view.
    func type(_ text: String) {
        for ch in text {
            let s = String(ch)
            let at = selection.location
            // Typing attributes come from the character before the caret, like NSTextView.
            var attrs = typing
            if !typingOverride, at > 0, at <= document.storage.length {
                attrs = document.storage.attributes(at: at - 1, effectiveRange: nil)
            }
            undo.beginUndoGrouping()
            editorReplace(selection, with: NSAttributedString(string: s, attributes: attrs))
            undo.endUndoGrouping()
            selection = NSRange(location: at + (s as NSString).length, length: 0)
            typing = [:]
            typingOverride = false
            commands.didInsertText(s)
        }
    }

    func enter() { if !commands.insertNewline() { type("\n") } }

    func backspace() {
        guard !commands.deleteBackward() else { return }
        let at = selection.location
        guard at > 0 else { return }
        undo.beginUndoGrouping()
        editorReplace(NSRange(location: at - 1, length: 1), with: NSAttributedString(string: ""))
        undo.endUndoGrouping()
        selection = NSRange(location: at - 1, length: 0)
    }

    var text: String { document.storage.string }
    var kinds: [ParagraphKind] { document.paragraphs().map(\.kind) }
    func caret(at location: Int) { selection = NSRange(location: location, length: 0); typingOverride = false; typing = [:] }
    func caretAtEnd() { caret(at: document.storage.length) }
}
