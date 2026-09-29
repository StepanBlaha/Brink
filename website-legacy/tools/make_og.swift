// Renders assets/og.png (1200x630): black, icon, "Brink", tagline, notch on the right edge.
// Usage: swift tools/make_og.swift assets/og.png assets/icon-512.png
import AppKit
let W = 1200, H = 630
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: W, pixelsHigh: H, bitsPerSample: 8, samplesPerPixel: 4,
                           hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let accent = NSColor(srgbRed: 0.04, green: 0.52, blue: 1, alpha: 1)
NSColor.black.setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill()
// soft accent glow
NSGradient(colors: [accent.withAlphaComponent(0.28), .clear])!
    .draw(fromCenter: NSPoint(x: 1200, y: 315), radius: 0, toCenter: NSPoint(x: 1200, y: 315), radius: 520, options: [])
// screen edge + notch (right side)
let edge = 1200.0 - 26.0
NSColor(white: 0.09, alpha: 1).setFill(); NSRect(x: edge, y: 0, width: 26, height: 630).fill()
let n = NSBezierPath(roundedRect: NSRect(x: 840, y: 205, width: 330, height: 220), xRadius: 44, yRadius: 44)
NSColor(white: 0.055, alpha: 1).setFill(); n.fill()
NSColor(white: 1, alpha: 0.10).setStroke(); n.lineWidth = 2; n.stroke()
// to-do rows in the notch
for (i, done) in [true, false, false].enumerated() {
    let y = 372.0 - Double(i) * 60
    let box = NSRect(x: 878, y: y - 14, width: 30, height: 30)
    let p = NSBezierPath(roundedRect: box, xRadius: 8, yRadius: 8)
    if done { accent.setFill(); p.fill()
        let c = NSBezierPath(); c.move(to: NSPoint(x: 885, y: y + 1)); c.line(to: NSPoint(x: 891, y: y - 6)); c.line(to: NSPoint(x: 902, y: y + 8))
        c.lineWidth = 4; c.lineCapStyle = .round; c.lineJoinStyle = .round; NSColor.white.setStroke(); c.stroke()
    } else { NSColor(white: 1, alpha: 0.35).setStroke(); p.lineWidth = 3; p.stroke() }
    NSColor(white: 1, alpha: done ? 0.3 : 0.8).setFill()
    NSBezierPath(roundedRect: NSRect(x: 926, y: y - 5, width: [170, 210, 130][i], height: 12), xRadius: 6, yRadius: 6).fill()
}
// icon
let icon = NSImage(contentsOfFile: CommandLine.arguments[2])!
icon.draw(in: NSRect(x: 70, y: 380, width: 190, height: 190))
func text(_ s: String, _ size: CGFloat, _ w: NSFont.Weight, _ a: CGFloat, _ x: CGFloat, _ y: CGFloat, kern: CGFloat = 0) {
    NSAttributedString(string: s, attributes: [.font: NSFont.systemFont(ofSize: size, weight: w),
        .foregroundColor: NSColor(white: 1, alpha: a), .kern: kern]).draw(at: NSPoint(x: x, y: y))
}
text("Brink", 132, .bold, 1, 76, 172, kern: -4)
text("Your pages, on the edge.", 46, .medium, 0.88, 84, 108)
text("A notch for your Notion pages and tasks.  macOS 14+", 26, .regular, 0.5, 86, 56)
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
