import AppKit

/// A full-screen "desktop" under the notch for recordings: the icon's dusk wallpaper, a clean
/// fake menu bar and a quiet fake app window. It hides the user's real desktop, windows, Dock
/// and menu-bar items.
@MainActor
final class DemoBackdrop {
    static let level = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue + 1)

    let window: NSWindow
    /// The fake menu-bar Brink icon; the mini-list popover anchors to it.
    let menuBarAnchor: NSView

    init(screen: NSScreen) {
        window = NSWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
        window.isOpaque = true
        window.backgroundColor = .black
        window.hasShadow = false
        // Swallows the parked real cursor's hover, so the Dock underneath never reacts to it.
        window.ignoresMouseEvents = false
        window.level = Self.level
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        let size = screen.frame.size
        let barHeight = max(screen.safeAreaInsets.top, NSStatusBar.system.thickness, 24)
        let view = BackdropView(frame: NSRect(origin: .zero, size: size))
        view.barHeight = barHeight
        window.contentView = view

        // Fake status item, left of the fake Wi-Fi / battery / clock.
        let anchor = NSImageView(frame: NSRect(x: size.width - 326, y: size.height - barHeight, width: 40, height: barHeight))
        let config = NSImage.SymbolConfiguration(pointSize: 14, weight: .medium)
        anchor.image = NSImage(systemSymbolName: "sidebar.right", accessibilityDescription: nil)?.withSymbolConfiguration(config)
        anchor.contentTintColor = .white
        anchor.imageScaling = .scaleNone
        view.addSubview(anchor)
        menuBarAnchor = anchor
        window.orderFrontRegardless()
    }
}

private final class BackdropView: NSView {
    var barHeight: CGFloat = 32

    override func draw(_ dirtyRect: NSRect) {
        let b = bounds
        NSGradient(colors: [NSColor(srgbRed: 0.36, green: 0.42, blue: 0.62, alpha: 1),
                            NSColor(srgbRed: 0.62, green: 0.52, blue: 0.66, alpha: 1),
                            NSColor(srgbRed: 0.93, green: 0.66, blue: 0.56, alpha: 1)])!.draw(in: b, angle: -70)
        // Soft glow low on the right, like a sunset behind hills.
        NSGradient(colors: [NSColor(srgbRed: 1, green: 0.78, blue: 0.6, alpha: 0.45), NSColor(srgbRed: 1, green: 0.78, blue: 0.6, alpha: 0)])!
            .draw(fromCenter: NSPoint(x: b.width * 0.72, y: b.height * 0.05), radius: 0,
                  toCenter: NSPoint(x: b.width * 0.72, y: b.height * 0.05), radius: b.width * 0.5, options: [])
        drawAppWindow(in: b)
        drawMenuBar(in: b)
    }

    private func drawMenuBar(in b: NSRect) {
        let bar = NSRect(x: 0, y: b.height - barHeight, width: b.width, height: barHeight)
        NSColor.black.withAlphaComponent(0.12).setFill()
        bar.fill()
        let font = NSFont.systemFont(ofSize: 13, weight: .regular)
        let bold = NSFont.systemFont(ofSize: 13, weight: .bold)
        let midY = bar.midY
        var x: CGFloat = 20
        if let apple = NSImage(systemSymbolName: "apple.logo", accessibilityDescription: nil)?
            .withSymbolConfiguration(.init(pointSize: 15, weight: .regular)) {
            tinted(apple).draw(at: NSPoint(x: x, y: midY - apple.size.height / 2), from: .zero, operation: .sourceOver, fraction: 1)
            x += apple.size.width + 20
        }
        for (index, title) in ["Finder", "File", "Edit", "View", "Go", "Window", "Help"].enumerated() {
            x += text(title, font: index == 0 ? bold : font, at: NSPoint(x: x, y: midY)) + 20
        }
        // Leaves room at the far right for the system's screen-recording indicator.
        var right = b.width - 44
        right -= text("Tue 29 Sep  9:41", font: font, at: NSPoint(x: right, y: midY), alignRight: true) + 18
        for name in ["battery.100percent", "wifi", "magnifyingglass"] {
            guard let symbol = NSImage(systemSymbolName: name, accessibilityDescription: nil)?
                .withSymbolConfiguration(.init(pointSize: 14, weight: .regular)) else { continue }
            right -= symbol.size.width
            tinted(symbol).draw(at: NSPoint(x: right, y: midY - symbol.size.height / 2), from: .zero, operation: .sourceOver, fraction: 1)
            right -= 18
        }
    }

    /// A calm, out-of-focus "document" window so the desktop looks lived-in.
    private func drawAppWindow(in b: NSRect) {
        let frame = NSRect(x: b.width * 0.09, y: b.height * 0.24, width: b.width * 0.5, height: b.height * 0.62)
        let shadow = NSShadow()
        shadow.shadowColor = NSColor.black.withAlphaComponent(0.25)
        shadow.shadowBlurRadius = 40
        shadow.shadowOffset = NSSize(width: 0, height: -12)
        NSGraphicsContext.saveGraphicsState()
        shadow.set()
        let body = NSBezierPath(roundedRect: frame, xRadius: 14, yRadius: 14)
        NSColor(white: 0.98, alpha: 0.88).setFill()
        body.fill()
        NSGraphicsContext.restoreGraphicsState()
        NSGraphicsContext.saveGraphicsState()
        body.addClip()
        // Sidebar.
        NSColor(white: 0.93, alpha: 0.9).setFill()
        NSRect(x: frame.minX, y: frame.minY, width: 190, height: frame.height).fill()
        NSGraphicsContext.restoreGraphicsState()
        for (i, color) in [NSColor.systemRed, .systemYellow, .systemGreen].enumerated() {
            color.withAlphaComponent(0.85).setFill()
            NSBezierPath(ovalIn: NSRect(x: frame.minX + 18 + CGFloat(i) * 20, y: frame.maxY - 26, width: 12, height: 12)).fill()
        }
        let gray = NSColor(white: 0.55, alpha: 0.35)
        for i in 0..<7 {
            bar(NSRect(x: frame.minX + 20, y: frame.maxY - 70 - CGFloat(i) * 30, width: CGFloat([110, 90, 130, 80, 100, 120, 70][i]), height: 9), gray)
        }
        let left = frame.minX + 230
        bar(NSRect(x: left, y: frame.maxY - 84, width: 280, height: 20), NSColor(white: 0.3, alpha: 0.45))
        var y = frame.maxY - 130
        for w in [0.82, 0.9, 0.7, 0.0, 0.86, 0.78, 0.92, 0.6, 0.0, 0.84, 0.74] {
            if w > 0 { bar(NSRect(x: left, y: y, width: (frame.maxX - left - 50) * w, height: 9), gray) }
            y -= 26
        }
    }

    private func bar(_ rect: NSRect, _ color: NSColor) {
        color.setFill()
        NSBezierPath(roundedRect: rect, xRadius: rect.height / 2, yRadius: rect.height / 2).fill()
    }

    @discardableResult
    private func text(_ string: String, font: NSFont, at point: NSPoint, alignRight: Bool = false) -> CGFloat {
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white]
        let size = (string as NSString).size(withAttributes: attrs)
        let origin = NSPoint(x: alignRight ? point.x - size.width : point.x, y: point.y - size.height / 2)
        (string as NSString).draw(at: origin, withAttributes: attrs)
        return size.width
    }

    private func tinted(_ image: NSImage) -> NSImage {
        let copy = image.copy() as! NSImage
        copy.lockFocus()
        NSColor.white.set()
        NSRect(origin: .zero, size: copy.size).fill(using: .sourceAtop)
        copy.unlockFocus()
        return copy
    }
}
