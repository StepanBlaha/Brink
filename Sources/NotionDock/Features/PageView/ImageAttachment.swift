import AppKit
import NotionKit

/// Pictures of image blocks: decoded images in memory, bytes on disk under cache/images (keyed by
/// the URL without its signature — `CoverCache` semantics, refetched on 403).
@MainActor
final class EditorImageStore {
    static let shared = EditorImageStore()

    let disk = CoverCache(directory: AppStorageLocation.cacheDirectory.appendingPathComponent("images", isDirectory: true))
    private var memory: [String: NSImage] = [:]

    private func key(_ source: ImageSource) -> String {
        switch source {
        case .upload(let id): return "upload:" + id
        case .file(let url), .external(let url): return CoverCache.key(for: url)
        }
    }

    func cached(_ source: ImageSource) -> NSImage? { memory[key(source)] }

    /// Just-uploaded bytes, shown at once (before Notion's file URL is known).
    func remember(uploadID: String, data: Data) {
        memory["upload:" + uploadID] = NSImage(data: data)
    }

    func load(_ source: ImageSource, refresh: @escaping @Sendable () async -> URL?, completion: @escaping @MainActor (NSImage?) -> Void) {
        if let image = cached(source) { completion(image); return }
        guard let url = source.url else { completion(nil); return }
        let key = key(source)
        let disk = disk
        Task {
            let data = await disk.imageData(for: url, refresh: refresh)
            let image = data.flatMap(NSImage.init(data:))
            if let image { self.memory[key] = image }
            completion(image)
        }
    }

    /// Bytes for re-uploading a moved image.
    nonisolated func data(for url: URL) async -> Data? {
        await disk.imageData(for: url, refresh: { nil })
    }
}

/// An image block's inline picture: scaled to the text width, at most 240 pt high, rounded.
final class ImageAttachmentCell: NSTextAttachmentCell {
    nonisolated static let maxHeight: CGFloat = 240
    nonisolated static let loadingHeight: CGFloat = 90
    var picture: NSImage?
    private var failed = false

    static func attachment(for info: ImageInfo, refresh: @escaping @Sendable () async -> URL?, view: @escaping @MainActor () -> NSTextView?) -> NSTextAttachment {
        let attachment = NSTextAttachment()
        let cell = ImageAttachmentCell()
        attachment.attachmentCell = cell
        guard let source = info.source else { cell.failed = true; return attachment }
        MainActor.assumeIsolated {
            if let image = EditorImageStore.shared.cached(source) {
                cell.picture = image
                return
            }
            EditorImageStore.shared.load(source, refresh: refresh) { [weak cell, weak attachment] image in
                guard let cell, let attachment else { return }
                cell.picture = image
                cell.failed = image == nil
                Self.relayout(attachment, in: view())
            }
        }
        return attachment
    }

    /// Re-lays out the character holding `attachment` (its picture's size changed).
    @MainActor
    private static func relayout(_ attachment: NSTextAttachment, in view: NSTextView?) {
        guard let view, let storage = view.textStorage, let layoutManager = view.layoutManager else { return }
        storage.enumerateAttribute(.attachment, in: NSRange(location: 0, length: storage.length), options: []) { value, range, stop in
            guard (value as? NSTextAttachment) === attachment else { return }
            layoutManager.invalidateLayout(forCharacterRange: range, actualCharacterRange: nil)
            layoutManager.invalidateDisplay(forCharacterRange: range)
            stop.pointee = true
        }
    }

    override nonisolated func cellSize() -> NSSize { NSSize(width: 200, height: Self.loadingHeight) }

    override nonisolated func cellBaselineOffset() -> NSPoint { .zero }

    override nonisolated func cellFrame(for textContainer: NSTextContainer, proposedLineFragment lineFrag: NSRect, glyphPosition position: NSPoint, characterIndex charIndex: Int) -> NSRect {
        let available = max(40, lineFrag.width - position.x - 4)
        let size: NSSize = MainActor.assumeIsolated {
            guard let picture, picture.size.width > 0, picture.size.height > 0 else {
                return NSSize(width: min(available, 320), height: failed ? 36 : Self.loadingHeight)
            }
            var width = min(available, picture.size.width)
            var height = width * picture.size.height / picture.size.width
            if height > Self.maxHeight {
                height = Self.maxHeight
                width = height * picture.size.width / picture.size.height
            }
            return NSSize(width: floor(width), height: floor(height))
        }
        return NSRect(origin: .zero, size: size)
    }

    /// Draws the picture, plus an accent ring while it's selected (Backspace/Delete then removes it).
    override nonisolated func draw(withFrame cellFrame: NSRect, in controlView: NSView?, characterIndex charIndex: Int, layoutManager: NSLayoutManager) {
        draw(withFrame: cellFrame, in: controlView)
        MainActor.assumeIsolated {
            guard let textView = controlView as? NSTextView else { return }
            let selection = textView.selectedRange()
            guard selection.length > 0, NSLocationInRange(charIndex, selection) else { return }
            let ring = NSBezierPath(roundedRect: cellFrame.insetBy(dx: 1, dy: 1), xRadius: 6, yRadius: 6)
            ring.lineWidth = 2
            Theme.Color.accentNS.setStroke()
            ring.stroke()
        }
    }

    override nonisolated func draw(withFrame cellFrame: NSRect, in controlView: NSView?) {
        MainActor.assumeIsolated {
            let path = NSBezierPath(roundedRect: cellFrame, xRadius: 6, yRadius: 6)
            NSGraphicsContext.saveGraphicsState()
            path.addClip()
            if let picture {
                picture.draw(in: cellFrame, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high.rawValue])
            } else {
                NSColor(white: 1, alpha: 0.06).setFill()
                cellFrame.fill()
                let label = (failed ? "Image unavailable" : "Loading image…") as NSString
                let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 12), .foregroundColor: NSColor(white: 1, alpha: 0.45)]
                let size = label.size(withAttributes: attrs)
                label.draw(at: NSPoint(x: cellFrame.midX - size.width / 2, y: cellFrame.midY - size.height / 2), withAttributes: attrs)
            }
            NSGraphicsContext.restoreGraphicsState()
        }
    }
}

/// The editor's layout manager. A selected picture shows its own accent ring, so the square
/// selection highlight behind it (which peeked out past the rounded corners and under the
/// picture) is skipped for ranges that hold only pictures and line breaks.
final class EditorLayoutManager: NSLayoutManager {
    override func fillBackgroundRectArray(_ rectArray: UnsafePointer<NSRect>, count rectCount: Int, forCharacterRange charRange: NSRange, color: NSColor) {
        if Self.onlyPictures(charRange, in: textStorage) { return }
        super.fillBackgroundRectArray(rectArray, count: rectCount, forCharacterRange: charRange, color: color)
    }

    private static func onlyPictures(_ range: NSRange, in storage: NSTextStorage?) -> Bool {
        guard let storage, range.length > 0, NSMaxRange(range) <= storage.length else { return false }
        let ns = storage.string as NSString
        var sawPicture = false
        for i in range.location..<NSMaxRange(range) {
            if ns.character(at: i) == 0x0A { continue }
            guard (storage.attribute(.attachment, at: i, effectiveRange: nil) as? NSTextAttachment)?.attachmentCell is ImageAttachmentCell else { return false }
            sawPicture = true
        }
        return sawPicture
    }
}
