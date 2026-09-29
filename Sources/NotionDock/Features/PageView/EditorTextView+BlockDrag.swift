import AppKit
import NotionKit

// The drag loop behind the ⋮⋮ handle (see +DragHandle for hover and drawing).
extension EditorTextView {
    /// If `event` is a click on a block's handle, runs the drag (or, for a plain click, selects
    /// the block) and returns true.
    func handleBlockDragMouseDown(_ event: NSEvent) -> Bool {
        guard isEditable, let window, let document else { return false }
        let point = convert(event.locationInWindow, from: nil)
        guard let start = paragraphStart(at: point) ?? hoveredParagraph,
              let rect = handleRect(forParagraphAt: start), rect.insetBy(dx: -3, dy: -3).contains(point) else { return false }

        slash?.close()
        blockDrag = BlockDrag(source: start, sourceDepth: document.depth(at: start), startX: point.x, target: nil, depth: document.depth(at: start))
        needsDisplay = true
        var dragged = false
        NSCursor.closedHand.push()
        window.trackEvents(matching: [.leftMouseDragged, .leftMouseUp], timeout: NSEvent.foreverDuration, mode: .eventTracking) { next, stop in
            guard let next else { return }
            MainActor.assumeIsolated {
                if next.type == .leftMouseUp { stop.pointee = true; return }
                let at = self.convert(next.locationInWindow, from: nil)
                if !dragged, hypot(at.x - point.x, at.y - point.y) < 3 { return }
                dragged = true
                self.autoscroll(with: next)
                self.updateBlockDrop(at: self.convert(next.locationInWindow, from: nil))
            }
        }
        NSCursor.pop()

        let drag = blockDrag
        blockDrag = nil
        if dragged, let drag, let target = drag.target {
            commands?.moveBlock(at: drag.source, before: target, depth: drag.depth)
            hoveredParagraph = selectedRange().location < (textStorage?.length ?? 0) ? document.paragraphRange(at: selectedRange().location).range.location : nil
        } else if !dragged {
            let paragraph = document.paragraphRange(at: start)
            window.makeFirstResponder(self)
            setSelectedRange(paragraph.content.length > 0 ? paragraph.content : NSRange(location: paragraph.content.location, length: 0))
        }
        needsDisplay = true
        return true
    }

    /// Recomputes the drop target (paragraph boundary nearest the pointer's y) and depth (the
    /// pointer's x offset from where the drag started, one level per indent step).
    private func updateBlockDrop(at point: NSPoint) {
        guard var drag = blockDrag, let document, let commands, let storage = textStorage else { return }
        let origin = textContainerOrigin
        let paragraphs = document.paragraphLayout().filter { $0.range.length > 0 }
        var target = paragraphs.count
        var indicatorY: CGFloat = 0
        var lastBottom: CGFloat = origin.y
        for (index, paragraph) in paragraphs.enumerated() {
            if storage.attribute(.notionHidden, at: paragraph.range.location, effectiveRange: nil) != nil { continue }
            guard let g = geometry(for: paragraph.range, kind: paragraph.kind, depth: paragraph.depth) else { continue }
            let top = origin.y + g.all.minY
            let bottom = origin.y + g.all.maxY
            if point.y < (top + bottom) / 2 {
                target = index
                indicatorY = top
                break
            }
            lastBottom = bottom
        }
        if target == paragraphs.count { indicatorY = lastBottom }

        let block = commands.blockIndices(at: drag.source)
        if let block, target > block.lowerBound, target <= block.upperBound {
            drag.target = nil // inside itself
        } else {
            let maxDepth = commands.maxDepth(forMoveOf: drag.source, before: target)
            let steps = Int(((point.x - drag.startX) / EditorStyling.indentPerLevel).rounded())
            drag.depth = max(0, min(drag.sourceDepth + steps, maxDepth))
            let stays = block.map { target == $0.lowerBound || target == $0.upperBound + 1 } ?? false
            drag.target = (stays && drag.depth == drag.sourceDepth) ? nil : target
            drag.indicatorY = indicatorY
        }
        blockDrag = drag
        needsDisplay = true
    }
}
