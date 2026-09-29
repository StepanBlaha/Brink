import AppKit

/// A fake mouse cursor for recordings: the system arrow / pointing-hand images drawn in a
/// click-through overlay above everything, moved along eased, slightly curved paths. The real
/// cursor is parked and hidden (moving it for real would need Accessibility access).
@MainActor
final class DemoCursor {
    static let shared = DemoCursor()

    enum Shape { case arrow, hand, iBeam }

    private var window: NSWindow?
    private let view = CursorView()
    private(set) var position: CGPoint = .zero
    private var hiddenSystemCursor = false

    func install(on screen: NSScreen, at start: CGPoint) {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: Self.box, height: Self.box), styleMask: .borderless, backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.ignoresMouseEvents = true
        window.level = NSWindow.Level(rawValue: NSWindow.Level.screenSaver.rawValue + 1)
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        view.frame = NSRect(x: 0, y: 0, width: Self.box, height: Self.box)
        window.contentView = view
        self.window = window
        place(start)
        window.orderFrontRegardless()

        // Park the real cursor out of sight and hide it for the recording.
        // CG coordinates are top-left based: this puts the arrow's tip on the bottom edge, so the
        // arrow itself hangs off-screen (screencapture -v always draws the real cursor).
        CGWarpMouseCursorPosition(CGPoint(x: screen.frame.midX, y: screen.frame.height - 1))
        CGDisplayHideCursor(CGMainDisplayID())
        NSCursor.hide()
        hiddenSystemCursor = true
    }

    func restoreSystemCursor() {
        guard hiddenSystemCursor else { return }
        hiddenSystemCursor = false
        NSCursor.unhide()
        CGDisplayShowCursor(CGMainDisplayID())
    }

    func set(_ shape: Shape) {
        view.shape = shape
        view.needsDisplay = true
    }

    func setVisible(_ visible: Bool) {
        view.alphaValue = visible ? 1 : 0
    }

    /// Moves to `target` (global AppKit coordinates) over `duration`, ease-in-out with a gentle arc.
    func move(to target: CGPoint, duration: TimeInterval) async {
        let start = position
        let dx = target.x - start.x, dy = target.y - start.y
        let distance = hypot(dx, dy)
        guard distance > 0.5 else { return }
        // Control point off to one side: hand movements are never perfectly straight.
        let bend = min(distance * 0.12, 60)
        let control = CGPoint(x: (start.x + target.x) / 2 - dy / distance * bend, y: (start.y + target.y) / 2 + dx / distance * bend)
        let began = Date()
        while true {
            let t = min(1, Date().timeIntervalSince(began) / duration)
            let e = t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2
            let u = 1 - e
            let p = CGPoint(x: u * u * start.x + 2 * u * e * control.x + e * e * target.x,
                            y: u * u * start.y + 2 * u * e * control.y + e * e * target.y)
            place(p)
            if t >= 1 { break }
            try? await Task.sleep(nanoseconds: 8_000_000)
        }
    }

    /// A little press animation (cursor shrinks briefly), like a real click feels.
    func press() async {
        view.pressed = true
        view.needsDisplay = true
        try? await Task.sleep(nanoseconds: 110_000_000)
        view.pressed = false
        view.needsDisplay = true
    }

    static let box: CGFloat = 64

    /// The cursor's hot spot sits at the box's center; the window moves, the view is static.
    private func place(_ p: CGPoint) {
        position = p
        window?.setFrameOrigin(NSPoint(x: (p.x - Self.box / 2).rounded(), y: (p.y - Self.box / 2).rounded()))
    }
}

private final class CursorView: NSView {
    var shape: DemoCursor.Shape = .arrow
    var pressed = false

    override var isFlipped: Bool { false }

    override func draw(_ dirtyRect: NSRect) {
        let cursor: NSCursor
        switch shape {
        case .arrow: cursor = .arrow
        case .hand: cursor = .pointingHand
        case .iBeam: cursor = .iBeam
        }
        let image = cursor.image
        let scale: CGFloat = pressed ? 0.88 : 1
        let size = NSSize(width: image.size.width * scale, height: image.size.height * scale)
        let hot = NSPoint(x: cursor.hotSpot.x * scale, y: cursor.hotSpot.y * scale)
        let local = NSPoint(x: bounds.midX, y: bounds.midY)
        // hotSpot is measured from the image's top-left.
        let rect = NSRect(x: local.x - hot.x, y: local.y - (size.height - hot.y), width: size.width, height: size.height)
        image.draw(in: rect)
    }
}
