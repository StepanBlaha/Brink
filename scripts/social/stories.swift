// Instagram Stories (1080x1920). Safe area: 250 px free at the top and bottom.
import AppKit

let cardRect = NSRect(x: 60, y: 720, width: 960, height: 780)
let storyShots: [Int: (String, CGRect)] = [
    2: ("marketing/screenshots/01-hover-peek.png", crop(2180, 615, 700, aspect: 960.0 / 780)),
    3: ("marketing/screenshots/02-task-panel.png", crop(1966, 300, 914, aspect: 960.0 / 780)),
    4: ("marketing/screenshots/03-editor.png", crop(1966, 223, 914, aspect: 960.0 / 780)),
    5: ("marketing/screenshots/05-quick-capture.png", crop(936, 202, 1008, aspect: 960.0 / 780)),
]
let storyText: [Int: String] = [
    2: "So I built a notch for it.",
    3: "Hover to peek.\nTick in place.",
    4: "A Notion-style editor, one hover away.",
    5: "Capture from any app. \u{2325}\u{21E7}Space.",
]

/// video == true leaves a transparent hole where the clip goes (used for frames 3-5 in story-video.mp4).
func storyFrame(_ n: Int, video: Bool = false) -> Canvas {
    let c = Canvas(1080, 1920)
    dusk(c)
    switch n {
    case 1:
        text("I opened Notion 40\u{00D7} a day just to tick one task.", NSRect(x: 80, y: 470, width: 860, height: 760),
             size: 124, kern: -2.5, line: 1.04, glow: true)
        notchMark(c, y: 1330, h: 250)
    case 6:
        icon(NSRect(x: 390, y: 330, width: 300, height: 300))
        text("Free and open source.", NSRect(x: 80, y: 690, width: 920, height: 240), size: 96, kern: -2, line: 1.04, glow: true)
        text("brinknotch.site", NSRect(x: 80, y: 925, width: 920, height: 100), size: 68, weight: .medium, kern: -0.8)
        let s = NSRect(x: 140, y: 1130, width: 800, height: 230)
        NSColor.white.withAlphaComponent(0.10).setFill(); rrect(s, 56).fill()
        let d = rrect(s, 56); d.lineWidth = 3; d.setLineDash([16, 14], count: 2, phase: 0)
        NSColor.white.withAlphaComponent(0.55).setStroke(); d.stroke()
        text("Link sticker goes here", NSRect(x: s.minX, y: s.minY, width: s.width, height: s.height), size: 38,
             weight: .medium, color: NSColor.white.withAlphaComponent(0.75), vcenter: true)
        text("MIT licensed \u{00B7} macOS 14+", NSRect(x: 80, y: 1500, width: 920, height: 60), size: 36, weight: .medium,
             color: NSColor.white.withAlphaComponent(0.85))
    default:
        text(storyText[n]!, NSRect(x: 80, y: 290, width: 900, height: 400), size: 96, kern: -2, line: 1.04, glow: true)
        if video {
            NSGraphicsContext.saveGraphicsState()
            let sh = NSShadow(); sh.shadowColor = NSColor.black.withAlphaComponent(0.38); sh.shadowBlurRadius = 60
            sh.shadowOffset = NSSize(width: 0, height: 24); sh.set()
            NSColor.black.setFill(); rrect(cardRect, 40).fill()
            NSGraphicsContext.restoreGraphicsState()
            c.ctx.setBlendMode(.clear); rrect(cardRect, 40).fill(); c.ctx.setBlendMode(.normal)
        } else {
            let (path, r) = storyShots[n]!
            card(loadCG(path), crop: r, into: cardRect)
        }
        if n == 5 {
            for (i, k) in ["\u{2325}", "\u{21E7}", "Space"].enumerated() {
                let x = 320 + [0, 120, 240][i], w: CGFloat = i == 2 ? 200 : 100
                keycap(k, NSRect(x: CGFloat(x), y: 1520, width: w, height: 90), size: 44)
            }
        }
    }
    if n != 6 {
        text("Brink", NSRect(x: 0, y: 1600, width: 1080, height: 60), size: 40, weight: .semibold,
             color: NSColor.white.withAlphaComponent(0.8))
    }
    return c
}
