// LinkedIn / Instagram carousel: 7 slides, 1080x1350. Margins 80 px.
import AppKit

let ink = NSColor.white
let soft = NSColor.white.withAlphaComponent(0.78)

func label(_ s: String, y: CGFloat = 96) {
    text(s.uppercased(), NSRect(x: 80, y: y, width: 920, height: 40), size: 28, weight: .semibold,
         color: NSColor.white.withAlphaComponent(0.72), align: .left, kern: 3)
}

func featureSlide(_ n: Int, tag: String, caption: String, shot: String, crop r: CGRect) -> Canvas {
    let c = Canvas(1080, 1350); dusk(c)
    label(tag)
    text(caption, NSRect(x: 80, y: 150, width: 920, height: 220), size: 84, align: .left, kern: -1.8, line: 1.04, glow: true)
    let h = 920.0 * r.height / r.width
    card(loadCG(shot), crop: r, into: NSRect(x: 80, y: 1230 - h, width: 920, height: h))
    text("\(n) / 4", NSRect(x: 80, y: 1266, width: 920, height: 40), size: 26, weight: .medium, color: soft, align: .left)
    text("Brink", NSRect(x: 80, y: 1266, width: 920, height: 40), size: 26, weight: .semibold, color: soft, align: .right)
    return c
}

func carouselSlide(_ n: Int) -> Canvas {
    switch n {
    case 1:
        let c = Canvas(1080, 1350); dusk(c)
        icon(NSRect(x: 80, y: 130, width: 190, height: 190))
        text("Brink", NSRect(x: 80, y: 420, width: 840, height: 260), size: 230, align: .left, kern: -8, glow: true)
        text("Your pages, on the edge.", NSRect(x: 80, y: 700, width: 800, height: 200), size: 78, weight: .medium,
             align: .left, kern: -1.5, line: 1.05)
        text("A free macOS notch for your Notion pages and tasks.", NSRect(x: 80, y: 1050, width: 700, height: 120),
             size: 36, weight: .regular, color: soft, align: .left)
        notchMark(c, y: 960, h: 300)
        return c
    case 2:
        let c = Canvas(1080, 1350); dusk(c)
        label("The problem")
        text("You open Notion to tick one task.", NSRect(x: 80, y: 240, width: 920, height: 460), size: 104,
             align: .left, kern: -2.5, line: 1.03, glow: true)
        text("Twenty minutes later you are somewhere else entirely.", NSRect(x: 80, y: 760, width: 800, height: 200), size: 54,
             weight: .regular, color: soft, align: .left, line: 1.12)
        notchMark(c, y: 1010, h: 250)
        return c
    case 3: return featureSlide(1, tag: "01  Peek", caption: "Hover the edge. Your page opens.",
                                shot: "marketing/screenshots/01-hover-peek.png", crop: crop(2180, 615, 700, aspect: 1.15))
    case 4: return featureSlide(2, tag: "02  Tick", caption: "Tick tasks in place.",
                                shot: "marketing/screenshots/02-task-panel.png", crop: crop(1966, 300, 914, aspect: 1.12))
    case 5: return featureSlide(3, tag: "03  Edit", caption: "A Notion-style editor, one hover away.",
                                shot: "marketing/screenshots/03-editor.png", crop: crop(1966, 223, 914, aspect: 1.2))
    case 6: return featureSlide(4, tag: "04  Capture", caption: "Capture from any app with \u{2325}\u{21E7}Space.",
                                shot: "marketing/screenshots/05-quick-capture.png", crop: crop(936, 202, 1008, aspect: 1.2))
    default:
        let c = Canvas(1080, 1350); dusk(c)
        icon(NSRect(x: 80, y: 110, width: 170, height: 170))
        text("Free and open source.", NSRect(x: 80, y: 330, width: 900, height: 250), size: 112, align: .left, kern: -3, line: 1.02, glow: true)
        var x: CGFloat = 80
        for chip in ["Free", "MIT licensed", "macOS 14+"] {
            let w = CGFloat(chip.count) * 25 + 64
            NSColor.black.withAlphaComponent(0.72).setFill(); rrect(NSRect(x: x, y: 640, width: w, height: 76), 38).fill()
            text(chip, NSRect(x: x, y: 640, width: w, height: 76), size: 32, weight: .medium, vcenter: true)
            x += w + 18
        }
        text("brinknotch.site", NSRect(x: 80, y: 800, width: 920, height: 120), size: 84, align: .left, kern: -1.5)
        text("Brink is an independent app and is not affiliated with Notion.", NSRect(x: 80, y: 1230, width: 920, height: 50),
             size: 24, weight: .regular, color: NSColor.white.withAlphaComponent(0.75), align: .left)
        return c
    }
}
