import AppKit
import NotionKit

/// Probe commands for the page editor: caret placement, real key events, image paste from a
/// private pasteboard (the user's clipboard is never touched) and ⋮⋮ handle drags.
extension DemoDirector {
    private func focusedTextView(_ pinID: String) -> EditorTextView? {
        guard let textView = dock.demoTextView(pinID: pinID) else { return nil }
        panelWindow.makeKeyAndOrderFront(nil)
        panelWindow.makeFirstResponder(textView)
        return textView
    }

    func probeCaret(pinID: String, find: String) -> String {
        guard let textView = focusedTextView(pinID) else { return "no text view" }
        let range = (textView.string as NSString).range(of: find)
        guard range.location != NSNotFound else { return "not found: \(find)" }
        textView.setSelectedRange(NSRange(location: range.location, length: 0))
        return "caret at \(range.location)"
    }

    /// A real keyDown through the text view's key bindings. `key`: up, down, left, right, return,
    /// delete, tab, or a single character; `mods`: any of "opt", "shift", "cmd", "ctrl" joined by +.
    func probeKey(pinID: String, key: String, mods: String) -> String {
        guard let textView = focusedTextView(pinID) else { return "no text view" }
        let special: [String: (UInt16, Int)] = [
            "up": (126, NSUpArrowFunctionKey), "down": (125, NSDownArrowFunctionKey), "left": (123, NSLeftArrowFunctionKey),
            "right": (124, NSRightArrowFunctionKey), "return": (36, 13), "delete": (51, 127), "tab": (48, 9),
            "fdel": (117, NSDeleteFunctionKey),
        ]
        var flags: NSEvent.ModifierFlags = []
        for m in mods.split(separator: "+") {
            switch m {
            case "opt": flags.insert(.option)
            case "shift": flags.insert(.shift)
            case "cmd": flags.insert(.command)
            case "ctrl": flags.insert(.control)
            default: break
            }
        }
        let (code, scalar) = special[key] ?? (0, Int(key.unicodeScalars.first?.value ?? 32))
        if special[key].map({ $0.0 >= 123 }) == true { flags.insert([.numericPad, .function]) }
        let chars = String(Character(UnicodeScalar(scalar) ?? " "))
        guard let event = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: flags, timestamp: ProcessInfo.processInfo.systemUptime,
                                           windowNumber: panelWindow.windowNumber, context: nil, characters: chars,
                                           charactersIgnoringModifiers: chars, isARepeat: false, keyCode: code) else { return "no event" }
        // Through the event queue, like a real key press: each press is its own run-loop pass,
        // so undo grouping by event behaves as it does for the user.
        NSApp.postEvent(event, atStart: false)
        return "posted \(key) \(mods)"
    }

    /// Pastes an image file through `insertImages(from:)` using a private, named pasteboard.
    func probePasteImage(pinID: String, path: String) -> String {
        guard let textView = focusedTextView(pinID) else { return "no text view" }
        let pasteboard = NSPasteboard(name: NSPasteboard.Name("cz.stepanblaha.brink.demo-probe"))
        pasteboard.clearContents()
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)) else { return "no file \(path)" }
        pasteboard.setData(data, forType: .png)
        let ok = textView.insertImages(from: pasteboard, at: textView.selectedRange().location)
        pasteboard.releaseGlobally()
        return "insertImages -> \(ok)"
    }

    /// Drags the ⋮⋮ handle of the paragraph containing `from` down (lines > 0) or up by `lines`
    /// paragraphs, dropping at that paragraph boundary. Posts the drag events before mouseDown,
    /// since the drag loop (`trackEvents`) pulls them from the queue.
    func probeHandleDrag(pinID: String, from: String, lines: Int) async -> String {
        guard let textView = focusedTextView(pinID), let document = textView.document else { return "no text view" }
        let ns = textView.string as NSString
        let hit = ns.range(of: from)
        guard hit.location != NSNotFound else { return "not found: \(from)" }
        let start = document.paragraphRange(at: hit.location).range.location
        textView.hoveredParagraph = start
        guard let handle = textView.handleRect(forParagraphAt: start) else { return "no handle" }
        let visible = document.paragraphLayout().filter { $0.range.length > 0 }
        guard let index = visible.firstIndex(where: { $0.range.location == start }) else { return "no paragraph index" }
        let targetIndex = max(0, min(visible.count - 1, index + lines))
        guard let targetRect = textView.handleRect(forParagraphAt: visible[targetIndex].range.location) else { return "no target" }
        // Below the target's middle when moving down (drop after it), above it when moving up.
        let dropY = lines > 0 ? targetRect.maxY + 2 : targetRect.minY - 2
        let from = CGPoint(x: handle.midX, y: handle.midY)
        let to = CGPoint(x: handle.midX, y: dropY)
        func windowPoint(_ p: CGPoint) -> CGPoint { textView.convert(p, to: nil) }
        func event(_ type: NSEvent.EventType, _ p: CGPoint) -> NSEvent? {
            NSEvent.mouseEvent(with: type, location: windowPoint(p), modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                               windowNumber: panelWindow.windowNumber, context: nil, eventNumber: 0, clickCount: 1,
                               pressure: type == .leftMouseUp ? 0 : 1)
        }
        for i in 1...8 {
            let t = CGFloat(i) / 8
            if let e = event(.leftMouseDragged, CGPoint(x: from.x, y: from.y + (to.y - from.y) * t)) { NSApp.postEvent(e, atStart: false) }
        }
        if let up = event(.leftMouseUp, to) { NSApp.postEvent(up, atStart: false) }
        guard let down = event(.leftMouseDown, from) else { return "no event" }
        panelWindow.sendEvent(down)
        await DemoUI.sleep(0.3)
        return "dragged handle at \(from) to \(to) (target paragraph \(targetIndex))"
    }
}
