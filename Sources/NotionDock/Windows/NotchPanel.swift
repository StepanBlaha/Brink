import AppKit
import SwiftUI

/// The single window for the whole dock: a borderless, non-activating panel whose frame is
/// fixed (big enough for the expanded state) and flush to the chosen screen edge. Everything
/// visible — the resting pill, the strip, the expanded panel — is one SwiftUI shape morphing
/// inside this unchanging frame, so there is never a second window and never a window-frame
/// animation; only the shape (and the mouse pass-through region) changes.
final class NotchPanel: NSPanel {
    init(size: NSSize) {
        let rect = NSRect(origin: .zero, size: size)
        super.init(
            contentRect: rect,
            styleMask: [.nonactivatingPanel, .borderless],
            backing: .buffered,
            defer: false
        )
        // Black surface: dark appearance gives light text carets, selection and placeholders.
        appearance = NSAppearance(named: .darkAqua)
        configure()
    }

    private func configure() {
        // Above the menu bar so the top edge can sit over it (and over the hardware notch's flanks).
        level = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue + 1)
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        isMovable = false
        isMovableByWindowBackground = false
        hidesOnDeactivate = false
        backgroundColor = .clear
        isOpaque = false
        hasShadow = false
        // Mouse pass-through is toggled live by DockController based on cursor position vs.
        // the current shape's bounding rect — the transparent area must never eat clicks
        // meant for whatever app is behind it.
        ignoresMouseEvents = true
        acceptsMouseMovedEvents = true
    }

    /// AppKit would otherwise push a window that overlaps the menu bar back below it.
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    func setContent<Content: View>(_ view: Content) {
        if let hosting = contentView as? NSHostingView<Content> {
            hosting.rootView = view
        } else {
            let hosting = NSHostingView(rootView: view)
            // The window's frame is owned by DockController. By default the hosting view
            // resizes its window to the SwiftUI content's size (top-left pinned on shrink,
            // bottom-left on grow): the first render at `windowSize == .zero` shrank the
            // window to nothing and the next grew it upward, parking it off screen at launch.
            hosting.sizingOptions = []
            contentView = hosting
        }
    }
}
