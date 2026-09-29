import AppKit
import NotionKit

// Clicks on gutter markers (checkbox, toggle arrow) act on the block without moving the caret;
// ⌘-click opens links. The caret line's typing style follows its block kind.
extension EditorTextView {
    override func mouseDown(with event: NSEvent) {
        slash?.close()
        if handleBlockDragMouseDown(event) { return }
        guard let document, let layoutManager, let textContainer, let storage = textStorage else {
            super.mouseDown(with: event); return
        }
        let point = convert(event.locationInWindow, from: nil)
        let inContainer = NSPoint(x: point.x - textContainerOrigin.x, y: point.y - textContainerOrigin.y)
        var fraction: CGFloat = 0
        let index = layoutManager.characterIndex(for: inContainer, in: textContainer, fractionOfDistanceBetweenInsertionPoints: &fraction)

        if event.modifierFlags.contains(.command), index < storage.length,
           let url = storage.attribute(.notionLink, at: index, effectiveRange: nil) as? URL {
            NSWorkspace.shared.open(url)
            return
        }

        if let hit = gutterHit(at: inContainer, index: index, document: document) {
            switch hit.kind {
            case .toDo:
                guard isEditable else { return }
                if case .toDo(let wasChecked) = document.kind(at: hit.location), !wasChecked { SoundService.shared.tick() }
                commands?.toggleCheckbox(paragraphAt: hit.location)
                animateCheckbox(at: hit.location)
            case .toggle:
                document.toggleCollapsed(paragraphAt: hit.location)
            default:
                break
            }
            needsDisplay = true
            return
        }
        super.mouseDown(with: event)
    }

    /// The block whose marker (checkbox / toggle arrow) is under `point`, if any.
    private func gutterHit(at point: NSPoint, index: Int, document: EditorDocument) -> (location: Int, kind: ParagraphKind)? {
        let candidates = [index, max(0, index - 1)]
        for candidate in candidates {
            let paragraph = document.paragraphRange(at: candidate)
            let kind = document.kind(at: paragraph.range.location)
            switch kind {
            case .toDo, .toggle: break
            default: continue
            }
            let depth = document.depth(at: paragraph.range.location)
            guard let g = geometry(for: paragraph.range, kind: kind, depth: depth) else { continue }
            let lineTop = g.firstLine.minY + g.style.paragraphSpacingBefore
            let lineBottom = g.firstLine.maxY - g.style.paragraphSpacing + 2
            if point.x >= g.gutterX, point.x < g.contentX - 2, point.y >= lineTop - 2, point.y <= lineBottom {
                return (paragraph.range.location, kind)
            }
        }
        return nil
    }

    /// Keeps the typing attributes' font/paragraph style in line with the caret's block, so an
    /// empty line (which has no characters to style) shows its caret at the block's inset.
    func refreshTypingStyle() {
        guard let document, selectedRange().length == 0 else { return }
        let location = selectedRange().location
        let kind = document.kind(at: location)
        let depth = document.depth(at: location)
        var typing = typingAttributes
        // New characters must carry the block's identity/kind, or text typed into an empty
        // converted line (slash menu, shortcut) would read back as a plain paragraph.
        if let storage = textStorage, storage.length > 0 {
            let ns = storage.string as NSString
            let paragraph = ns.paragraphRange(for: NSRange(location: min(location, ns.length), length: 0))
            let source = paragraph.length > 0 ? paragraph.location : max(0, location - 1)
            if source < storage.length {
                for key in NSAttributedString.Key.notionParagraphKeys {
                    typing[key] = storage.attribute(key, at: source, effectiveRange: nil)
                }
            }
        }
        typing[.paragraphStyle] = EditorStyling.paragraphStyle(kind: kind, depth: depth)
        typing[.font] = EditorStyling.font(for: kind)
        typing[.foregroundColor] = NSColor.white
        typingAttributes = typing
    }

    override func setSelectedRanges(_ ranges: [NSValue], affinity: NSSelectionAffinity, stillSelecting: Bool) {
        super.setSelectedRanges(ranges, affinity: affinity, stillSelecting: stillSelecting)
        if !stillSelecting { refreshTypingStyle() }
    }
}
