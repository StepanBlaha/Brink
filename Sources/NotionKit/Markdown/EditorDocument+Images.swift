import AppKit

// Image paragraphs: ONE attachment character (the picture) carrying the paragraph identity with
// kind `.image(source:)`. Atomic: text can't be typed into them; deleting removes the block.
// While an upload runs, a local-only "Uploading image…" token chip (no block id, so the sync
// planner skips it) stands where the image will go.
extension EditorDocument {
    public static let uploadPlaceholderType = "image_upload"

    func imageParagraph(_ info: ImageInfo, attrs: [NSAttributedString.Key: Any]) -> NSAttributedString {
        let picture = NSMutableAttributedString(attachment: imageAttachmentFactory(info))
        picture.addAttributes(attrs, range: NSRange(location: 0, length: picture.length))
        return picture
    }

    /// Whether `range` holds an attachment character (an image paragraph's picture).
    func containsAttachment(_ range: NSRange) -> Bool {
        guard range.length > 0, NSMaxRange(range) <= storage.length else { return false }
        let ns = storage.string as NSString
        for i in range.location..<NSMaxRange(range) where ns.character(at: i) == 0xFFFC {
            if storage.attribute(.attachment, at: i, effectiveRange: nil) != nil { return true }
        }
        return false
    }

    /// Inserts an "Uploading image…" chip as its own paragraph after the paragraph at `location`.
    /// Returns the placeholder's local id.
    public func insertUploadPlaceholder(afterParagraphAt location: Int) -> String {
        let info = TokenInfo(blockID: "", type: Self.uploadPlaceholderType, title: "Uploading image…")
        let identity = Identity(localID: UUID().uuidString, blockID: nil, kindTag: ParagraphKind.token(type: info.type, title: info.title).tag, depth: depth(at: location))
        let attrs = paragraphAttributes(identity)
        let chip = NSMutableAttributedString(attachment: attachmentFactory(info))
        var chipAttrs = attrs
        chipAttrs[.notionToken] = info.encoded
        chip.addAttributes(chipAttrs, range: NSRange(location: 0, length: chip.length))
        insertAtomicParagraph(chip, identity: identity, afterParagraphAt: location)
        return identity.localID
    }

    /// Turns the placeholder into the uploaded image paragraph. False if the placeholder is gone.
    @discardableResult
    public func replacePlaceholder(_ localID: String, withImage source: ImageSource) -> Bool {
        guard let paragraph = rangeOfParagraph(localID: localID), let old = identity(of: paragraph) else { return false }
        var identity = old
        identity.kindTag = ParagraphKind.image(source: source.encoded).tag
        let picture = imageParagraph(ImageInfo(blockID: nil, source: source), attrs: paragraphAttributes(identity))
        programmaticReplace(contentRange(of: paragraph), with: picture)
        if let range = rangeOfParagraph(localID: localID) { apply(identity, to: range) }
        cacheLastParagraph()
        noteLocalEdit(restyling: rangeOfParagraph(localID: localID))
        return true
    }

    /// Removes the placeholder paragraph (upload failed).
    public func removePlaceholder(_ localID: String) {
        guard let paragraph = rangeOfParagraph(localID: localID) else { return }
        var range = paragraph
        let ns = storage.string as NSString
        if NSMaxRange(range) == ns.length, !(ns.substring(with: range).hasSuffix("\n")), range.location > 0 {
            range = NSRange(location: range.location - 1, length: range.length + 1) // the break before it
        }
        programmaticReplace(range, with: NSAttributedString())
    }

    /// Inserts `content` (one atomic paragraph without terminator) as a new paragraph after the
    /// paragraph at `location`, forcing `identity` onto it. Undoable through the text view.
    func insertAtomicParagraph(_ content: NSAttributedString, identity: Identity, afterParagraphAt location: Int) {
        let paragraph = paragraphRange(at: location)
        let at = NSMaxRange(paragraph.content)
        let insertion = NSMutableAttributedString(string: "\n", attributes: baseAttributes)
        insertion.append(content)
        let selection = textView?.selectedRange()
        programmaticReplace(NSRange(location: at, length: 0), with: insertion)
        apply(identity, to: paragraphRange(at: at + 1).range)
        cacheLastParagraph()
        if let selection, let textView {
            let shifted = selection.location > at ? selection.location + insertion.length : selection.location
            textView.setSelectedRange(NSRange(location: min(shifted, storage.length), length: 0))
        }
    }

    /// A character edit made by the document itself (through the text view when there is one,
    /// so it's undoable and passes the input guards).
    func programmaticReplace(_ range: NSRange, with string: NSAttributedString) {
        isProgrammaticEdit = true
        defer { isProgrammaticEdit = false }
        if let textView, textView.shouldChangeText(in: range, replacementString: string.string) {
            storage.replaceCharacters(in: range, with: string)
            textView.didChangeText()
        } else {
            storage.replaceCharacters(in: range, with: string)
        }
    }
}
