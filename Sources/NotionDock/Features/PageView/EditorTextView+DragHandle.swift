import AppKit
import NotionKit

/// An in-progress drag of a block's ⋮⋮ handle.
struct BlockDrag {
    /// Start of the dragged block's first paragraph.
    var source: Int
    var sourceDepth: Int
    var startX: CGFloat
    /// Paragraph index (among paragraphs with characters) to drop before; nil = no valid drop.
    var target: Int?
    var depth: Int
    var indicatorY: CGFloat = 0
}

// Notion-style drag to reorder: hovering a block shows a ⋮⋮ handle left of its marker; dragging
// it shows a drop line between blocks (its x offset picks the nesting depth) and drops the block
// with its children there (`EditorCommands.moveBlock`, one undo step).
extension EditorTextView {
    static let handleGutter: CGFloat = 30
    static let handleSize = NSSize(width: 14, height: 20)

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let hoverTrackingArea { removeTrackingArea(hoverTrackingArea) }
        let area = NSTrackingArea(rect: .zero, options: [.mouseMoved, .mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self, userInfo: nil)
        addTrackingArea(area)
        hoverTrackingArea = area
    }

    override func mouseMoved(with event: NSEvent) {
        super.mouseMoved(with: event)
        let point = convert(event.locationInWindow, from: nil)
        let hovered = isEditable ? paragraphStart(at: point) : nil
        if hovered != hoveredParagraph {
            if let old = hoveredParagraph, let rect = handleRect(forParagraphAt: old) { setNeedsDisplay(rect.insetBy(dx: -2, dy: -2)) }
            hoveredParagraph = hovered
            if let hovered, let rect = handleRect(forParagraphAt: hovered) { setNeedsDisplay(rect.insetBy(dx: -2, dy: -2)) }
        }
        if let hovered, handleRect(forParagraphAt: hovered)?.contains(point) == true { NSCursor.openHand.set() }
    }

    override func mouseExited(with event: NSEvent) {
        super.mouseExited(with: event)
        if blockDrag == nil, hoveredParagraph != nil { hoveredParagraph = nil; needsDisplay = true }
    }

    /// Start of the (visible, non-empty) paragraph whose lines span `point`'s y.
    func paragraphStart(at point: NSPoint) -> Int? {
        guard let document, let layoutManager, let textContainer, let storage = textStorage, storage.length > 0 else { return nil }
        let inContainer = NSPoint(x: max(0, point.x - textContainerOrigin.x), y: point.y - textContainerOrigin.y)
        let glyph = layoutManager.glyphIndex(for: inContainer, in: textContainer)
        let char = min(layoutManager.characterIndexForGlyph(at: glyph), storage.length - 1)
        let paragraph = document.paragraphRange(at: char).range
        guard paragraph.length > 0, storage.attribute(.notionHidden, at: paragraph.location, effectiveRange: nil) == nil,
              let g = geometry(for: paragraph, kind: document.kind(at: paragraph.location), depth: document.depth(at: paragraph.location)),
              inContainer.y >= g.all.minY, inContainer.y <= g.all.maxY else { return nil }
        return paragraph.location
    }

    /// Where the handle of the paragraph starting at `location` is drawn (view coordinates).
    func handleRect(forParagraphAt location: Int) -> NSRect? {
        guard let document, let storage = textStorage, location < storage.length else { return nil }
        let paragraph = document.paragraphRange(at: location).range
        guard paragraph.length > 0 else { return nil }
        let kind = document.kind(at: paragraph.location)
        guard let g = geometry(for: paragraph, kind: kind, depth: document.depth(at: paragraph.location)) else { return nil }
        let size = Self.handleSize
        let lineTop = g.firstLine.minY + g.style.paragraphSpacingBefore
        let lineHeight = kind.isImage ? size.height : max(size.height, g.firstLine.height - g.style.paragraphSpacingBefore - g.style.paragraphSpacing)
        let y = textContainerOrigin.y + lineTop + (lineHeight - size.height) / 2
        return NSRect(x: textContainerOrigin.x + g.gutterX - size.width - 4, y: y, width: size.width, height: size.height)
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        if let drag = blockDrag {
            if let rect = handleRect(forParagraphAt: drag.source) { drawHandle(in: rect, active: true) }
            if drag.target != nil { drawDropIndicator(drag) }
        } else if isEditable, let hovered = hoveredParagraph, let rect = handleRect(forParagraphAt: hovered), rect.intersects(dirtyRect) {
            drawHandle(in: rect, active: false)
        }
    }

    private func drawHandle(in rect: NSRect, active: Bool) {
        NSColor(white: 1, alpha: active ? 0.12 : 0.0).setFill()
        NSBezierPath(roundedRect: rect, xRadius: 3, yRadius: 3).fill()
        NSColor(white: 1, alpha: active ? 0.7 : 0.35).setFill()
        for column in 0..<2 {
            for row in 0..<3 {
                let x = rect.midX - 3 + CGFloat(column) * 5
                let y = rect.midY - 5 + CGFloat(row) * 5
                NSBezierPath(ovalIn: NSRect(x: x - 1.25, y: y - 1.25, width: 2.5, height: 2.5)).fill()
            }
        }
    }

    private func drawDropIndicator(_ drag: BlockDrag) {
        let x = textContainerOrigin.x + CGFloat(drag.depth) * EditorStyling.indentPerLevel
        let width = (textContainer?.size.width ?? bounds.width) - CGFloat(drag.depth) * EditorStyling.indentPerLevel
        Theme.Color.accentNS.setFill()
        NSBezierPath(roundedRect: NSRect(x: x, y: drag.indicatorY - 1, width: max(0, width), height: 2), xRadius: 1, yRadius: 1).fill()
        NSBezierPath(ovalIn: NSRect(x: x - 3, y: drag.indicatorY - 3, width: 6, height: 6)).fill()
    }
}
