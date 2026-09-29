import AppKit
import UniformTypeIdentifiers
import NotionKit

/// Image bytes ready for Notion's File Upload API (TIFF and other exotic formats → PNG).
struct PastedImage {
    var data: Data
    var filename: String
    var contentType: String
}

enum ImagePasteboard {
    /// Types Notion accepts as is; anything else is converted to PNG.
    private static let passthrough: [String: String] = [
        "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif",
        "webp": "image/webp", "heic": "image/heic",
    ]

    static let dragTypes: [NSPasteboard.PasteboardType] = [.fileURL, .png, .tiff, NSPasteboard.PasteboardType(UTType.jpeg.identifier)]

    /// Images on the pasteboard: image files first (a Finder copy also carries the file's icon as
    /// TIFF — never that), then raw PNG/JPEG/TIFF data.
    static func images(from pasteboard: NSPasteboard) -> [PastedImage] {
        if let urls = pasteboard.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL], !urls.isEmpty {
            return urls.compactMap(image(fromFile:))
        }
        if let png = pasteboard.data(forType: .png) {
            return [PastedImage(data: png, filename: "Pasted image.png", contentType: "image/png")]
        }
        if let jpeg = pasteboard.data(forType: NSPasteboard.PasteboardType(UTType.jpeg.identifier)) {
            return [PastedImage(data: jpeg, filename: "Pasted image.jpg", contentType: "image/jpeg")]
        }
        if let tiff = pasteboard.data(forType: .tiff), let png = pngData(tiff) {
            return [PastedImage(data: png, filename: "Pasted image.png", contentType: "image/png")]
        }
        return []
    }

    static func image(fromFile url: URL) -> PastedImage? {
        guard let type = UTType(filenameExtension: url.pathExtension), type.conforms(to: .image),
              let data = try? Data(contentsOf: url) else { return nil }
        let ext = url.pathExtension.lowercased()
        let base = url.deletingPathExtension().lastPathComponent
        if let contentType = passthrough[ext] {
            return PastedImage(data: data, filename: url.lastPathComponent, contentType: contentType)
        }
        guard let png = pngData(data) else { return nil }
        return PastedImage(data: png, filename: base + ".png", contentType: "image/png")
    }

    static func pngData(_ data: Data) -> Data? {
        if let rep = NSBitmapImageRep(data: data), let png = rep.representation(using: .png, properties: [:]) { return png }
        guard let image = NSImage(data: data), let tiff = image.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff) else { return nil }
        return rep.representation(using: .png, properties: [:])
    }
}

// ⌘V / drop of images → an image block after the caret's (or drop point's) paragraph.
extension EditorTextView {
    /// Returns true if the pasteboard held images (they're being uploaded).
    func insertImages(from pasteboard: NSPasteboard, at location: Int) -> Bool {
        let images = ImagePasteboard.images(from: pasteboard)
        guard !images.isEmpty, let onInsertImage, isEditable else { return false }
        // Each goes right after the same paragraph: insert in reverse to keep their order.
        for image in images.reversed() { onInsertImage(image, location) }
        return true
    }

    override var acceptableDragTypes: [NSPasteboard.PasteboardType] {
        super.acceptableDragTypes + ImagePasteboard.dragTypes
    }

    private func draggedImageFiles(_ sender: NSDraggingInfo) -> Bool {
        let pasteboard = sender.draggingPasteboard
        if let urls = pasteboard.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL], !urls.isEmpty {
            return urls.contains { UTType(filenameExtension: $0.pathExtension)?.conforms(to: .image) == true }
        }
        return pasteboard.availableType(from: [.png, .tiff]) != nil
    }

    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        if sender.draggingSource as AnyObject? !== self, draggedImageFiles(sender) { return isEditable ? .copy : [] }
        return super.draggingEntered(sender)
    }

    override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation {
        if sender.draggingSource as AnyObject? !== self, draggedImageFiles(sender) {
            _ = super.draggingUpdated(sender) // keeps the drop caret moving
            return isEditable ? .copy : []
        }
        return super.draggingUpdated(sender)
    }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        if sender.draggingSource as AnyObject? !== self, draggedImageFiles(sender) {
            let point = convert(sender.draggingLocation, from: nil)
            let index = characterIndexForInsertion(at: point)
            window?.makeFirstResponder(self)
            return insertImages(from: sender.draggingPasteboard, at: index)
        }
        return super.performDragOperation(sender)
    }
}
