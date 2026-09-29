import AppKit

/// Small helpers the director uses to find on-screen elements (through the app's own
/// accessibility tree, which needs no permission in-process) and to type like a person.
@MainActor
enum DemoUI {
    /// First element (depth-first) in `window` whose label, title, value or help contains `text`.
    static func element(_ text: String, in window: NSWindow?) -> NSAccessibilityProtocol? {
        guard let root = window?.contentView else { return nil }
        return search(root, text: text.lowercased(), depth: 0)
    }

    private static func search(_ node: Any, text: String, depth: Int) -> NSAccessibilityProtocol? {
        guard depth < 40, let object = node as? NSObject, let element = node as? NSAccessibilityProtocol else { return nil }
        let strings = [#selector(NSAccessibilityProtocol.accessibilityLabel), #selector(NSAccessibilityProtocol.accessibilityTitle),
                       #selector(NSAccessibilityProtocol.accessibilityValue), #selector(NSAccessibilityProtocol.accessibilityHelp)]
            .compactMap { string(object, $0) }
        if depth > 0, strings.contains(where: { $0.lowercased().contains(text) }),
           object.responds(to: #selector(NSAccessibilityElementProtocol.accessibilityFrame)) {
            let frame = element.accessibilityFrame()
            if frame.width > 0, frame.height > 0 { return element }
        }
        let children = object.responds(to: #selector(NSAccessibilityProtocol.accessibilityChildren)) ? element.accessibilityChildren() ?? [] : []
        for child in children {
            if let found = search(child, text: text, depth: depth + 1) { return found }
        }
        return nil
    }

    /// Calls an object-returning accessibility getter only if the object implements it.
    private static func string(_ object: NSObject, _ selector: Selector) -> String? {
        guard object.responds(to: selector) else { return nil }
        return object.perform(selector)?.takeUnretainedValue() as? String
    }

    /// Screen center (global AppKit coordinates) of an element, optionally nudged.
    static func center(_ element: NSAccessibilityProtocol?, dx: CGFloat = 0, dy: CGFloat = 0) -> CGPoint? {
        guard let frame = element?.accessibilityFrame(), frame.width > 0 else { return nil }
        return CGPoint(x: frame.midX + dx, y: frame.midY + dy)
    }

    /// Screen frame (global AppKit coordinates) of an element.
    static func frame(_ element: NSAccessibilityProtocol?) -> CGRect? {
        guard let frame = element?.accessibilityFrame(), frame.width > 0 else { return nil }
        return frame
    }

    /// A real click delivered straight to one of the app's windows (no Accessibility needed).
    static func sendClick(at screenPoint: CGPoint, in window: NSWindow) {
        let point = window.convertPoint(fromScreen: screenPoint)
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            guard let event = NSEvent.mouseEvent(with: type, location: point, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                                                 windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1,
                                                 pressure: type == .leftMouseDown ? 1 : 0) else { continue }
            window.sendEvent(event)
        }
    }

    @discardableResult
    static func press(_ element: NSAccessibilityProtocol?) -> Bool {
        guard let object = element as? NSObject, let element,
              object.responds(to: #selector(NSAccessibilityProtocol.accessibilityPerformPress)) else { return false }
        return element.accessibilityPerformPress()
    }

    /// Types `text` one character at a time with a human rhythm (faster inside words).
    static func type(_ text: String, into textView: NSTextView?, baseDelay: Double = 0.075) async {
        for character in text {
            guard let textView else { return }
            textView.insertText(String(character), replacementRange: textView.selectedRange())
            let jitter = Double.random(in: -0.025...0.035)
            let pause = character == " " ? baseDelay * 1.6 : baseDelay
            await sleep(pause + jitter)
        }
    }

    static func key(_ selector: Selector, in textView: NSTextView?) {
        textView?.doCommand(by: selector)
    }

    /// Screen point of the character at `location` in a text view (for aiming the cursor).
    static func point(ofCharacterAt location: Int, in textView: NSTextView?) -> CGPoint? {
        guard let textView, let window = textView.window else { return nil }
        let length = (textView.string as NSString).length
        guard length > 0 else { return nil }
        let rect = textView.firstRect(forCharacterRange: NSRange(location: min(location, length - 1), length: 1), actualRange: nil)
        _ = window
        return CGPoint(x: rect.minX, y: rect.midY)
    }

    static func sleep(_ seconds: Double) async {
        try? await Task.sleep(nanoseconds: UInt64(max(0, seconds) * 1_000_000_000))
    }
}

/// A small keycap HUD ("⌥ ⇧ Space") so viewers see which shortcut was pressed.
@MainActor
final class DemoKeyHUD {
    private var window: NSWindow?

    func show(_ text: String, on screen: NSScreen, for seconds: Double) async {
        let label = NSTextField(labelWithString: text)
        label.font = .systemFont(ofSize: 22, weight: .semibold)
        label.textColor = .white
        label.alignment = .center
        label.sizeToFit()
        let size = NSSize(width: label.frame.width + 48, height: 54)
        let frame = NSRect(x: screen.frame.midX - size.width / 2, y: screen.frame.minY + 120, width: size.width, height: size.height)
        let window = NSWindow(contentRect: frame, styleMask: .borderless, backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.ignoresMouseEvents = true
        window.level = NSWindow.Level(rawValue: NSWindow.Level.screenSaver.rawValue)
        let box = NSView(frame: NSRect(origin: .zero, size: size))
        box.wantsLayer = true
        box.layer?.backgroundColor = NSColor.black.withAlphaComponent(0.78).cgColor
        box.layer?.cornerRadius = 14
        label.frame.origin = NSPoint(x: 24, y: (size.height - label.frame.height) / 2)
        box.addSubview(label)
        window.contentView = box
        window.alphaValue = 0
        window.orderFrontRegardless()
        self.window = window
        NSAnimationContext.runAnimationGroup({ context in context.duration = 0.18; window.animator().alphaValue = 1 }, completionHandler: nil)
        await DemoUI.sleep(seconds)
        NSAnimationContext.runAnimationGroup({ context in context.duration = 0.25; window.animator().alphaValue = 0 }, completionHandler: nil)
        await DemoUI.sleep(0.3)
        window.orderOut(nil)
    }
}
