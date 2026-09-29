import Foundation

// Images: paste/drop → "Uploading image…" placeholder → File Upload API → the placeholder turns
// into an image paragraph (source `upload:ID`) → the next sync appends it as
// `{"type":"file_upload","file_upload":{"id":…}}`. Image blocks are never updated; a moved one is
// recreated (a Notion-hosted file is re-uploaded, since its signed URL expires).
extension PageEditorEngine {
    /// Uploads `data` and inserts it as an image block after the paragraph at `location`.
    /// Returns false (and sets `errorMessage`) if the upload failed; the placeholder is removed.
    @discardableResult
    public func insertImage(data: Data, filename: String, contentType: String, afterParagraphAt location: Int) async -> Bool {
        guard hasLoaded else { return false }
        if data.count > NotionClient.singlePartUploadLimit {
            errorMessage = FileUploadError.tooLarge(bytes: data.count).localizedDescription
            return false
        }
        let placeholder = document.insertUploadPlaceholder(afterParagraphAt: location)
        do {
            let id = try await client.uploadFile(data: data, filename: filename, contentType: contentType)
            Self.log.info("uploaded image \(filename, privacy: .public) as \(id, privacy: .public) (\(data.count) bytes)")
            onImageUploaded?(id, data)
            guard document.replacePlaceholder(placeholder, withImage: .upload(id: id)) else {
                Self.log.notice("upload placeholder gone (undone?) — image \(id, privacy: .public) not inserted")
                return false
            }
            return true
        } catch {
            Self.log.error("image upload failed: \(String(describing: error), privacy: .public)")
            document.removePlaceholder(placeholder)
            errorMessage = "Image not uploaded: " + Self.humanMessage(for: error)
            return false
        }
    }

    /// A fresh signed URL for an image block (Notion file URLs expire → 403).
    public func freshImageURL(blockID: String) async -> URL? {
        guard let block = try? await client.retrieveBlock(blockID), let encoded = block.imageSource else { return nil }
        return ImageSource(encoded: encoded)?.url
    }

    /// The blocks to append for `paragraphs`. A Notion-hosted image being recreated (moved) is
    /// re-uploaded from its bytes first.
    func prepareBlocks(_ paragraphs: [DocParagraph]) async throws -> [NewBlock] {
        var out: [NewBlock] = []
        for paragraph in paragraphs {
            if case .image(let encoded) = paragraph.kind, case .file(let url) = ImageSource(encoded: encoded) {
                let data: Data
                if let provided = await imageDataProvider?(url) {
                    data = provided
                } else {
                    let (downloaded, response) = try await URLSession.shared.data(from: url)
                    guard (response as? HTTPURLResponse)?.statusCode ?? 200 < 300 else {
                        throw NotionError.network("Couldn't download the image to move it")
                    }
                    data = downloaded
                }
                let name = url.lastPathComponent.isEmpty ? "image.png" : url.lastPathComponent
                let id = try await client.uploadFile(data: data, filename: name, contentType: Self.contentType(forFilename: name))
                out.append(.imageUpload(id: id))
            } else {
                out.append(Self.newBlock(for: paragraph))
            }
        }
        return out
    }

    /// `blocks` with image URLs stripped of their signatures (Notion re-signs file URLs on every
    /// fetch — that alone must not count as a remote change and rebuild the editor).
    nonisolated static func comparable(_ blocks: [SyncedParagraph]) -> [SyncedParagraph] {
        blocks.map { block in
            guard case .image(let encoded) = block.kind, case .file(let url) = ImageSource(encoded: encoded),
                  var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return block }
            components.query = nil
            var copy = block
            copy.kind = .image(source: ImageSource.file(components.url ?? url).encoded)
            return copy
        }
    }

    nonisolated static func contentType(forFilename name: String) -> String {
        switch (name as NSString).pathExtension.lowercased() {
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "heic": return "image/heic"
        case "tif", "tiff": return "image/tiff"
        case "bmp": return "image/bmp"
        case "svg": return "image/svg+xml"
        default: return "image/png"
        }
    }
}
