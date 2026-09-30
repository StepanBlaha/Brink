// Shared drawing helpers for the Brink social assets (top-left coordinate system).
// Text is rendered with AppKit because the Homebrew ffmpeg has no drawtext.
import AppKit

func hex(_ v: Int, _ a: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255,
            blue: CGFloat(v & 255) / 255, alpha: a)
}
let accent = hex(0x0A84FF)

func loadCG(_ path: String) -> CGImage {
    guard let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil)
    else { fatalError("cannot load \(path)") }
    return cg
}

final class Canvas {
    let w: Int, h: Int
    let rep: NSBitmapImageRep
    var ctx: CGContext { NSGraphicsContext.current!.cgContext }
    init(_ w: Int, _ h: Int) {
        self.w = w; self.h = h
        rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4,
                               hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        let g = NSGraphicsContext(bitmapImageRep: rep)!
        g.cgContext.translateBy(x: 0, y: CGFloat(h)); g.cgContext.scaleBy(x: 1, y: -1)
        let flipped = NSGraphicsContext(cgContext: g.cgContext, flipped: true)
        flipped.imageInterpolation = .high
        NSGraphicsContext.current = flipped
    }
    func save(_ path: String) {
        guard let png = rep.representation(using: .png, properties: [:]) else { fatalError("png") }
        try! png.write(to: URL(fileURLWithPath: path))
    }
}

/// House "dusk" wallpaper: 160deg gradient, warm glow low right, faint sheen top left, soft vignette.
func dusk(_ c: Canvas) {
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    let W = CGFloat(c.w), H = CGFloat(c.h), ctx = c.ctx
    ctx.saveGState()
    let g = CGGradient(colorsSpace: cs, colors: [hex(0x5c6b9e).cgColor, hex(0x9e85a8).cgColor, hex(0xeda88f).cgColor] as CFArray,
                       locations: [0, 0.5, 1])!
    let d = CGPoint(x: 0.342, y: 0.940), L = (abs(W * d.x) + abs(H * d.y)) / 2
    let mid = CGPoint(x: W / 2, y: H / 2)
    ctx.drawLinearGradient(g, start: CGPoint(x: mid.x - d.x * L, y: mid.y - d.y * L),
                           end: CGPoint(x: mid.x + d.x * L, y: mid.y + d.y * L), options: [])
    func radial(_ center: CGPoint, _ r: CGFloat, _ inner: NSColor, _ outer: NSColor) {
        let rg = CGGradient(colorsSpace: cs, colors: [inner.cgColor, outer.cgColor] as CFArray, locations: [0, 1])!
        ctx.drawRadialGradient(rg, startCenter: center, startRadius: 0, endCenter: center, endRadius: r, options: [])
    }
    let m = max(W, H)
    radial(CGPoint(x: W * 0.85, y: H * 0.92), m * 0.7, hex(0xFFC799, 0.30), hex(0xFFC799, 0))
    radial(CGPoint(x: W * 0.1, y: H * 0.05), m * 0.6, NSColor.white.withAlphaComponent(0.10), NSColor.white.withAlphaComponent(0))
    radial(mid, hypot(W, H) / 2, NSColor.black.withAlphaComponent(0), NSColor.black.withAlphaComponent(0.16))
    ctx.restoreGState()
}

/// Draws wrapped text in `r`; returns the laid-out height. vcenter centers the block inside r.
@discardableResult
func text(_ s: String, _ r: NSRect, size: CGFloat, weight: NSFont.Weight = .semibold, color: NSColor = .white,
          align: NSTextAlignment = .center, kern: CGFloat = 0, line: CGFloat = 1.08, glow: Bool = false,
          vcenter: Bool = false, draw: Bool = true) -> CGFloat {
    let p = NSMutableParagraphStyle()
    p.alignment = align; p.lineHeightMultiple = line; p.lineBreakMode = .byWordWrapping
    var attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: size, weight: weight),
                                                .foregroundColor: color, .paragraphStyle: p, .kern: kern]
    if glow {
        let sh = NSShadow(); sh.shadowColor = NSColor.black.withAlphaComponent(0.22); sh.shadowBlurRadius = 30
        attrs[.shadow] = sh
    }
    let a = NSAttributedString(string: s, attributes: attrs)
    let hh = ceil(a.boundingRect(with: NSSize(width: r.width, height: 10000), options: [.usesLineFragmentOrigin]).height)
    if draw { a.draw(in: NSRect(x: r.minX, y: r.minY + (vcenter ? (r.height - hh) / 2 : 0), width: r.width, height: hh + 8)) }
    return hh
}

func rrect(_ r: NSRect, _ radius: CGFloat) -> NSBezierPath { NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius) }

/// Screenshot crop (pixel rect, top-left origin) as a rounded card with shadow and hairline rim.
func card(_ cg: CGImage, crop: CGRect, into r: NSRect, radius: CGFloat = 40, rim: Bool = true) {
    let path = rrect(r, radius)
    NSGraphicsContext.saveGraphicsState()
    let sh = NSShadow(); sh.shadowColor = NSColor.black.withAlphaComponent(0.38); sh.shadowBlurRadius = 60
    sh.shadowOffset = NSSize(width: 0, height: 24)
    sh.set(); NSColor.black.setFill(); path.fill()
    NSGraphicsContext.restoreGraphicsState()
    NSGraphicsContext.saveGraphicsState()
    path.addClip()
    let part = cg.cropping(to: crop)!
    NSImage(cgImage: part, size: NSSize(width: part.width, height: part.height))
        .draw(in: r, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
    NSGraphicsContext.restoreGraphicsState()
    if rim { NSColor.white.withAlphaComponent(0.14).setStroke(); path.lineWidth = 2; path.stroke() }
}

/// Crop rect of a given aspect (w/h) anchored at (x, y) with pixel width cw.
func crop(_ x: CGFloat, _ y: CGFloat, _ cw: CGFloat, aspect: CGFloat) -> CGRect {
    CGRect(x: x, y: y, width: cw, height: cw / aspect)
}

/// The notch mark: black slab flush to the right edge of the canvas, accent checkbox inside.
func notchMark(_ c: Canvas, y: CGFloat, h: CGFloat, w: CGFloat = 132) {
    let r = NSRect(x: CGFloat(c.w) - w, y: y, width: w + 60, height: h)
    NSColor.black.setFill(); rrect(r, 44).fill()
    let s: CGFloat = 44
    let box = NSRect(x: CGFloat(c.w) - w / 2 - s / 2 + 6, y: y + h / 2 - s / 2, width: s, height: s)
    accent.setFill(); rrect(box, 11).fill()
    let chk = NSBezierPath(); chk.lineWidth = 6; chk.lineCapStyle = .round; chk.lineJoinStyle = .round
    chk.move(to: NSPoint(x: box.minX + 11, y: box.midY + 1)); chk.line(to: NSPoint(x: box.minX + 19, y: box.midY + 9))
    chk.line(to: NSPoint(x: box.maxX - 10, y: box.minY + 12)); NSColor.white.setStroke(); chk.stroke()
    for i in [-1.0, 1.0] {
        let dot = NSRect(x: box.midX - 6, y: box.midY + CGFloat(i) * 62 - 6, width: 12, height: 12)
        NSColor.white.withAlphaComponent(0.32).setFill(); NSBezierPath(ovalIn: dot).fill()
    }
}

let iconImage: CGImage = loadCG("branding/icon-1024.png")
func icon(_ r: NSRect) {
    NSImage(cgImage: iconImage, size: NSSize(width: iconImage.width, height: iconImage.height))
        .draw(in: r, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
}

/// Keycap chip, e.g. "⌥".
func keycap(_ s: String, _ r: NSRect, size: CGFloat = 40) {
    NSColor.black.withAlphaComponent(0.78).setFill(); rrect(r, 16).fill()
    NSColor.white.withAlphaComponent(0.18).setStroke(); let p = rrect(r, 16); p.lineWidth = 2; p.stroke()
    text(s, NSRect(x: r.minX, y: r.minY, width: r.width, height: r.height), size: size, weight: .medium, vcenter: true)
}
