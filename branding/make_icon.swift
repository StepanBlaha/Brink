// Renders the Brink app icon: a squircle showing a screen's right edge
// ("screen" wallpaper + black bezel) and the black notch hugging it, accent checkbox inside.
// Usage: swift branding/make_icon.swift <out.iconset dir>
import AppKit

func render(_ px: Int) -> NSBitmapImageRep {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let s = CGFloat(px), inset = s * 0.09, box = NSRect(x: inset, y: inset, width: s - 2 * inset, height: s - 2 * inset)

    // Squircle background.
    let bg = NSBezierPath(roundedRect: box, xRadius: box.width * 0.225, yRadius: box.width * 0.225)
    // "Screen": the graphite wallpaper (branding/BRAND.md), a touch lighter so the black notch reads.
    NSGradient(colors: [NSColor(srgbRed: 0x5b / 255.0, green: 0x61 / 255.0, blue: 0x6a / 255.0, alpha: 1),
                        NSColor(srgbRed: 0x46 / 255.0, green: 0x4b / 255.0, blue: 0x53 / 255.0, alpha: 1),
                        NSColor(srgbRed: 0x2e / 255.0, green: 0x32 / 255.0, blue: 0x38 / 255.0, alpha: 1)])!.draw(in: bg, angle: -70)
    bg.addClip()
    // Soft cool sheen at the top left, like light on a matte display.
    NSGradient(colors: [NSColor(srgbRed: 0.85, green: 0.9, blue: 1, alpha: 0.16), NSColor(srgbRed: 0.85, green: 0.9, blue: 1, alpha: 0)])!
        .draw(fromCenter: NSPoint(x: box.minX + box.width * 0.2, y: box.maxY - box.height * 0.1), radius: 0,
              toCenter: NSPoint(x: box.minX + box.width * 0.2, y: box.maxY - box.height * 0.1), radius: box.width * 0.75, options: [])

    // Black bezel on the right edge; the notch hangs off it.
    let edgeX = box.maxX - box.width * 0.1
    NSColor.black.setFill()
    NSRect(x: edgeX, y: box.minY, width: box.maxX - edgeX, height: box.height).fill()

    // Notch with concave flares where it meets the edge.
    let depth = box.width * 0.5, length = box.height * 0.46, cr = box.width * 0.1, fl = box.width * 0.07
    let top = box.midY + length / 2, bottom = box.midY - length / 2, farX = edgeX - depth
    let notch = CGMutablePath()
    notch.move(to: CGPoint(x: edgeX, y: top + fl))
    notch.addArc(tangent1End: CGPoint(x: edgeX, y: top), tangent2End: CGPoint(x: farX, y: top), radius: fl)
    notch.addArc(tangent1End: CGPoint(x: farX, y: top), tangent2End: CGPoint(x: farX, y: bottom), radius: cr)
    notch.addArc(tangent1End: CGPoint(x: farX, y: bottom), tangent2End: CGPoint(x: edgeX, y: bottom), radius: cr)
    notch.addArc(tangent1End: CGPoint(x: edgeX, y: bottom), tangent2End: CGPoint(x: edgeX, y: bottom - fl), radius: fl)
    notch.addLine(to: CGPoint(x: edgeX + box.width, y: bottom - fl))
    notch.addLine(to: CGPoint(x: edgeX + box.width, y: top + fl))
    notch.closeSubpath()
    let ctx = NSGraphicsContext.current!.cgContext
    ctx.addPath(notch); ctx.setFillColor(NSColor.black.cgColor); ctx.fillPath()

    // Accent checkbox inside the notch.
    let cb = box.width * 0.16
    let cbRect = NSRect(x: farX + depth * 0.3 - cb / 2, y: box.midY - cb / 2, width: cb, height: cb)
    NSColor(srgbRed: 0.04, green: 0.52, blue: 1, alpha: 1).setFill()
    NSBezierPath(roundedRect: cbRect, xRadius: cb * 0.24, yRadius: cb * 0.24).fill()
    let check = NSBezierPath()
    check.move(to: NSPoint(x: cbRect.minX + cb * 0.24, y: cbRect.midY))
    check.line(to: NSPoint(x: cbRect.minX + cb * 0.43, y: cbRect.minY + cb * 0.28))
    check.line(to: NSPoint(x: cbRect.maxX - cb * 0.22, y: cbRect.maxY - cb * 0.26))
    check.lineWidth = cb * 0.13; check.lineCapStyle = .round; check.lineJoinStyle = .round
    NSColor.white.setStroke(); check.stroke()

    // Faint rim so the dark squircle still separates from a dark Dock.
    bg.lineWidth = max(1, box.width * 0.012)
    NSColor(white: 1, alpha: 0.1).setStroke(); bg.stroke()

    NSGraphicsContext.restoreGraphicsState()
    return rep
}

let out = URL(fileURLWithPath: CommandLine.arguments[1])
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
for (name, px) in [("16x16", 16), ("16x16@2x", 32), ("32x32", 32), ("32x32@2x", 64), ("128x128", 128),
                   ("128x128@2x", 256), ("256x256", 256), ("256x256@2x", 512), ("512x512", 512), ("512x512@2x", 1024)] {
    try! render(px).representation(using: .png, properties: [:])!.write(to: out.appendingPathComponent("icon_\(name).png"))
}
