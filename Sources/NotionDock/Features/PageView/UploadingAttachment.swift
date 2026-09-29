import AppKit
import NotionKit

/// The "Uploading image…" placeholder chip, with a spinning arc. It keeps redrawing itself only
/// while it's being drawn (i.e. while it's in the text and visible).
final class UploadingAttachmentCell: NSTextAttachmentCell {
    private static let label = "Uploading image…" as NSString
    private static let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 13, weight: .medium),
        .foregroundColor: NSColor(white: 1, alpha: 0.75),
    ]

    static func attachment() -> NSTextAttachment {
        let attachment = NSTextAttachment()
        attachment.attachmentCell = UploadingAttachmentCell()
        return attachment
    }

    override nonisolated func cellSize() -> NSSize {
        let text = Self.label.size(withAttributes: Self.attrs)
        return NSSize(width: ceil(text.width) + 40, height: 26)
    }

    override nonisolated func cellBaselineOffset() -> NSPoint { NSPoint(x: 0, y: -7) }

    override nonisolated func draw(withFrame cellFrame: NSRect, in controlView: NSView?) {
        MainActor.assumeIsolated {
            NSColor(white: 1, alpha: 0.08).setFill()
            NSBezierPath(roundedRect: cellFrame, xRadius: 6, yRadius: 6).fill()

            let center = NSPoint(x: cellFrame.minX + 16, y: cellFrame.midY)
            let angle = CGFloat(Date().timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1)) * 360
            let flipped = controlView?.isFlipped ?? true
            let arc = NSBezierPath()
            arc.appendArc(withCenter: center, radius: 6, startAngle: flipped ? -angle : angle, endAngle: (flipped ? -angle : angle) + 270)
            arc.lineWidth = 2
            arc.lineCapStyle = .round
            NSColor(white: 1, alpha: 0.8).setStroke()
            arc.stroke()

            let size = Self.label.size(withAttributes: Self.attrs)
            Self.label.draw(at: NSPoint(x: cellFrame.minX + 30, y: cellFrame.midY - size.height / 2), withAttributes: Self.attrs)

            guard let controlView else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0 / 30) { [weak controlView] in
                controlView?.setNeedsDisplay(cellFrame)
            }
        }
    }
}
