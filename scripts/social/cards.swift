// X / LinkedIn card, reel cover, reel caption overlays and end card.
import AppKit

func xCard() -> Canvas {
    let c = Canvas(1600, 900); dusk(c)
    text("Your pages,\non the edge.", NSRect(x: 90, y: 250, width: 720, height: 340), size: 112, align: .left, kern: -3, line: 1.02, glow: true)
    text("Brink is a free notch for your Notion pages and tasks.", NSRect(x: 90, y: 640, width: 560, height: 110), size: 32,
         weight: .regular, color: soft, align: .left, line: 1.2)
    icon(NSRect(x: 90, y: 90, width: 84, height: 84))
    text("brinknotch.site", NSRect(x: 196, y: 108, width: 500, height: 50), size: 36, weight: .medium, align: .left)
    let r = crop(1966, 223, 914, aspect: 0.86)
    card(loadCG("marketing/screenshots/03-editor.png"), crop: r, into: NSRect(x: 880, y: 80, width: 640, height: 640 / 0.86 > 740 ? 740 : 640 / 0.86), radius: 36)
    return c
}

func reelCover() -> Canvas {
    let c = Canvas(1080, 1920); dusk(c)
    text("Your pages,\non the edge.", NSRect(x: 80, y: 300, width: 920, height: 400), size: 132, kern: -3.5, line: 1.02, glow: true)
    let r = crop(1966, 223, 914, aspect: 0.9)
    card(loadCG("marketing/screenshots/03-editor.png"), crop: r, into: NSRect(x: 60, y: 760, width: 960, height: 960 / 0.9 > 900 ? 900 : 960 / 0.9))
    text("Brink \u{00B7} free \u{00B7} macOS", NSRect(x: 0, y: 1700, width: 1080, height: 60), size: 40, weight: .medium, color: soft)
    return c
}

/// Transparent full-frame caption for the reel: dark pill near the top (clear of the panel).
func reelCaption(_ s: String) -> Canvas {
    let c = Canvas(1080, 1920)
    let w = min(940, text(s, NSRect(x: 0, y: 0, width: 4000, height: 200), size: 62, align: .left, draw: false) > 0 ? CGFloat(s.count) * 33 + 100 : 600)
    let r = NSRect(x: (1080 - w) / 2, y: 128, width: w, height: 124)
    NSColor.black.withAlphaComponent(0.8).setFill(); rrect(r, 62).fill()
    text(s, r, size: 62, vcenter: true)
    return c
}

func reelHook() -> Canvas {
    let c = Canvas(1080, 1920)
    let g = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!, colors: [hex(0x2a2f4a, 0.55).cgColor, hex(0x2a2f4a, 0).cgColor] as CFArray, locations: [0, 1])!
    c.ctx.drawLinearGradient(g, start: CGPoint(x: 0, y: 400), end: CGPoint(x: 0, y: 1500), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
    text("I opened Notion 40\u{00D7} a day for one task.", NSRect(x: 70, y: 420, width: 800, height: 700), size: 112, align: .left, kern: -2.5, line: 1.04, glow: true)
    return c
}

func reelEnd() -> Canvas {
    let c = Canvas(1080, 1920); dusk(c)
    icon(NSRect(x: 340, y: 560, width: 400, height: 400))
    text("Brink \u{00B7} free \u{00B7} brinknotch.site", NSRect(x: 30, y: 1030, width: 1020, height: 100), size: 58, kern: -0.5)
    text("Your pages, on the edge.", NSRect(x: 30, y: 1140, width: 1020, height: 80), size: 42, weight: .regular, color: soft)
    return c
}
