import AppKit
import NotionKit

/// Where a block sits on screen (container coordinates).
struct BlockGeometry {
    var firstLine: NSRect
    var all: NSRect
    var baseline: CGFloat
    var gutterX: CGFloat
    var contentX: CGFloat
    var style: NSParagraphStyle
}

// Block markers drawn in the left inset — never text: bullets, numbers, checkboxes, quote bars,
// code/callout backgrounds, dividers, toggle arrows.
extension EditorTextView {
    func geometry(for range: NSRange, kind: ParagraphKind, depth: Int) -> BlockGeometry? {
        guard let layoutManager else { return nil }
        let style = EditorStyling.paragraphStyle(kind: kind, depth: depth)
        let gutterX = CGFloat(depth) * EditorStyling.indentPerLevel
        let contentX = EditorStyling.contentX(kind: kind, depth: depth)
        if range.length == 0 {
            let extra = layoutManager.extraLineFragmentRect
            guard extra.height > 0 else { return nil }
            let font = EditorStyling.font(for: kind)
            let baseline = extra.minY + style.paragraphSpacingBefore + font.ascender
            return BlockGeometry(firstLine: extra, all: extra, baseline: baseline, gutterX: gutterX, contentX: contentX, style: style)
        }
        let glyphs = layoutManager.glyphRange(forCharacterRange: range, actualCharacterRange: nil)
        guard glyphs.length > 0 else { return nil }
        let firstLine = layoutManager.lineFragmentRect(forGlyphAt: glyphs.location, effectiveRange: nil)
        // An empty block's only glyph is its line break, whose reported location sits lower
        // than real text; derive the baseline from the font instead so empty and filled lines
        // put their markers (checkbox, bullet, number) at the same height.
        let isEmptyBlock = (textStorage?.string as NSString?)?
            .substring(with: range).trimmingCharacters(in: .newlines).isEmpty ?? false
        let baseline = isEmptyBlock
            ? firstLine.minY + style.paragraphSpacingBefore + EditorStyling.font(for: kind).ascender
            : firstLine.minY + layoutManager.location(forGlyphAt: glyphs.location).y
        var all = NSRect.null
        layoutManager.enumerateLineFragments(forGlyphRange: glyphs) { rect, _, _, _, _ in all = all.union(rect) }
        return BlockGeometry(firstLine: firstLine, all: all.isNull ? firstLine : all, baseline: baseline, gutterX: gutterX, contentX: contentX, style: style)
    }

    override func drawBackground(in rect: NSRect) {
        super.drawBackground(in: rect)
        guard let document, let layoutManager, let textContainer, let storage = textStorage else { return }
        let origin = textContainerOrigin
        let visibleGlyphs = layoutManager.glyphRange(forBoundingRect: rect.offsetBy(dx: -origin.x, dy: -origin.y), in: textContainer)
        let visible = layoutManager.characterRange(forGlyphRange: visibleGlyphs, actualGlyphRange: nil)
        let layout = document.paragraphLayout()
        let numbers = ListNumbering.numbers(for: layout.map { ($0.kind, $0.depth) })
        let caretParagraph: Int? = (window?.firstResponder === self && selectedRange().length == 0)
            ? document.paragraphRange(at: selectedRange().location).range.location : nil

        for (index, paragraph) in layout.enumerated() {
            let range = paragraph.range
            let isTrailing = range.length == 0
            if !isTrailing {
                if NSMaxRange(range) < visible.location || range.location > NSMaxRange(visible) + 1 { continue }
                if storage.attribute(.notionHidden, at: range.location, effectiveRange: nil) != nil { continue }
            }
            guard let geometry = geometry(for: range, kind: paragraph.kind, depth: paragraph.depth) else { continue }
            drawMarker(paragraph.kind, depth: paragraph.depth, number: numbers[index], range: range, geometry: geometry, origin: origin)
            if caretParagraph == range.location, document.paragraphRange(at: range.location).content.length == 0 {
                drawPlaceholder(for: paragraph.kind, geometry: geometry, origin: origin)
            }
        }
    }

    private func drawMarker(_ kind: ParagraphKind, depth: Int, number: Int?, range: NSRange, geometry g: BlockGeometry, origin: NSPoint) {
        let x = origin.x + g.gutterX
        let baseline = origin.y + g.baseline
        let width = (textContainer?.size.width ?? bounds.width) - g.gutterX - 4
        let top = origin.y + g.all.minY + g.style.paragraphSpacingBefore
        let bottom = origin.y + g.all.maxY - g.style.paragraphSpacing
        switch kind {
        case .bulleted:
            let glyphs = ["•", "◦", "▪︎"]
            drawText(glyphs[depth % 3], font: .systemFont(ofSize: depth % 3 == 2 ? 10 : 15), color: .white, x: x + 8, baseline: baseline)
        case .numbered:
            let label = "\(number ?? 1)." as NSString
            let font = NSFont.monospacedDigitSystemFont(ofSize: EditorStyling.bodySize, weight: .regular)
            let size = label.size(withAttributes: [.font: font])
            drawText(label as String, font: font, color: .white, x: origin.x + g.contentX - 6 - size.width, baseline: baseline)
        case .toDo(let checked):
            drawCheckbox(checked: checked, at: NSPoint(x: x + 3, y: baseline - 13), localID: document?.localID(at: range.location))
        case .quote:
            Theme.Color.quoteBarNS.setFill()
            NSBezierPath(roundedRect: NSRect(x: x + 2, y: top + 1, width: 3, height: max(0, bottom - top - 2)), xRadius: 1.5, yRadius: 1.5).fill()
        case .code:
            Theme.Color.sidebarNS.setFill()
            NSBezierPath(roundedRect: NSRect(x: x, y: top - 4, width: max(0, width), height: max(0, bottom - top + 8)), xRadius: 6, yRadius: 6).fill()
        case .callout(let icon):
            Theme.Color.sidebarNS.setFill()
            NSBezierPath(roundedRect: NSRect(x: x, y: top - 3, width: max(0, width), height: max(0, bottom - top + 6)), xRadius: 6, yRadius: 6).fill()
            drawText(icon.isEmpty ? ParagraphKind.defaultCalloutIcon : icon, font: .systemFont(ofSize: 14), color: .white, x: x + 5, baseline: baseline)
        case .toggle:
            let collapsed = document?.isCollapsed(paragraphAt: range.location) ?? false
            drawText(collapsed ? "▸" : "▾", font: .systemFont(ofSize: 13), color: Theme.Color.secondaryNS, x: x + 7, baseline: baseline)
        case .divider:
            let y = origin.y + (g.firstLine.minY + g.style.paragraphSpacingBefore + g.firstLine.maxY - g.style.paragraphSpacing) / 2
            NSColor(white: 1, alpha: 0.18).setFill()
            NSRect(x: x, y: floor(y), width: max(0, width), height: 1).fill()
        default:
            break
        }
    }

    private func drawPlaceholder(for kind: ParagraphKind, geometry g: BlockGeometry, origin: NSPoint) {
        guard let text = EditorStyling.placeholder(for: kind) else { return }
        drawText(text, font: EditorStyling.font(for: kind), color: Theme.Color.tertiaryNS, x: origin.x + g.contentX, baseline: origin.y + g.baseline)
    }

    func drawText(_ text: String, font: NSFont, color: NSColor, x: CGFloat, baseline: CGFloat) {
        (text as NSString).draw(at: NSPoint(x: x, y: baseline - font.ascender), withAttributes: [.font: font, .foregroundColor: color])
    }

    // MARK: - Checkbox

    static let checkboxSize: CGFloat = 16

    private func drawCheckbox(checked: Bool, at point: NSPoint, localID: String?) {
        let size = Self.checkboxSize
        var progress: CGFloat = 1
        if let localID, let start = checkAnimations[localID] {
            progress = min(1, CGFloat(Date().timeIntervalSince(start) / 0.18))
            if progress >= 1 { checkAnimations[localID] = nil }
        }
        let box = NSRect(x: point.x, y: point.y, width: size, height: size)
        if checked {
            let scale = 0.7 + 0.3 * progress
            let fill = box.insetBy(dx: size * (1 - scale) / 2, dy: size * (1 - scale) / 2)
            Theme.Color.accentNS.withAlphaComponent(0.4 + 0.6 * progress).setFill()
            NSBezierPath(roundedRect: fill, xRadius: 4, yRadius: 4).fill()
            let check = NSBezierPath()
            check.move(to: NSPoint(x: box.minX + 4, y: box.midY))
            check.line(to: NSPoint(x: box.minX + 7, y: box.maxY - 4.5))
            check.line(to: NSPoint(x: box.maxX - 3.5, y: box.minY + 4.5))
            check.lineWidth = 1.8
            check.lineCapStyle = .round
            check.lineJoinStyle = .round
            NSColor.white.withAlphaComponent(progress).setStroke()
            check.stroke()
        } else {
            let border = NSBezierPath(roundedRect: box.insetBy(dx: 0.75, dy: 0.75), xRadius: 4, yRadius: 4)
            border.lineWidth = 1.5
            NSColor(white: 1, alpha: 0.45).setStroke()
            border.stroke()
        }
    }

    /// Starts the check/uncheck animation for the to-do at `location`.
    func animateCheckbox(at location: Int) {
        guard let localID = document?.localID(at: location) else { return }
        checkAnimations[localID] = Date()
        animationTimer?.invalidate()
        let started = Date()
        animationTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60, repeats: true) { [weak self] timer in
            MainActor.assumeIsolated {
                self?.needsDisplay = true
                if Date().timeIntervalSince(started) > 0.25 { timer.invalidate() }
            }
        }
    }
}

extension Theme.Color {
    static var quoteBarNS: NSColor { NSColor(white: 1, alpha: 0.75) }
}
