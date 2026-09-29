import AppKit

// Whole-block commands: deleting an (atomic) image paragraph, and moving a block together with
// its indented children (drag handle, ⌥⇧↑ / ⌥⇧↓). Both are ordinary undoable text replacements
// whose characters carry their paragraph identity, so the document keeps every block's id and
// the sync planner sees exactly "same ids, new order / removed id".
extension EditorCommands {
    private var text: NSString { document.storage.string as NSString }

    // MARK: - Images

    /// Backspace/Delete with the caret on (or the selection exactly on) an image paragraph removes
    /// the whole block. Returns true if handled.
    @discardableResult
    public func deleteImage(at selection: NSRange) -> Bool {
        let paragraph = document.paragraphRange(at: selection.location)
        guard paragraph.range.length > 0, document.kind(at: paragraph.range.location).isImage,
              selection.location >= paragraph.content.location, NSMaxRange(selection) <= NSMaxRange(paragraph.content) else { return false }
        var range = paragraph.range
        let hasBreak = NSMaxRange(paragraph.content) < NSMaxRange(paragraph.range)
        if !hasBreak, range.location > 0 {
            range = NSRange(location: range.location - 1, length: range.length + 1) // last line: take the break before it
        }
        undoStep("Delete Image") {
            replace(range, with: NSAttributedString())
            select(min(range.location, document.storage.length))
        }
        return true
    }

    /// Forward delete: removes a picture under the caret; at the end of a line followed by a
    /// picture, selects the picture (the next Delete removes it). Returns true if handled.
    @discardableResult
    public func deleteForward() -> Bool {
        guard let host else { return false }
        let selection = host.editorSelection
        if deleteImage(at: selection) { return true }
        guard selection.length == 0 else { return false }
        let paragraph = document.paragraphRange(at: selection.location)
        guard selection.location == NSMaxRange(paragraph.content), NSMaxRange(paragraph.range) < document.storage.length else { return false }
        let next = document.paragraphRange(at: NSMaxRange(paragraph.range))
        guard document.kind(at: next.range.location).isImage else { return false }
        host.setEditorSelection(next.content)
        return true
    }

    // MARK: - Moving blocks

    /// Paragraphs that have characters (the empty last line can't be moved).
    private func movableParagraphs() -> [(range: NSRange, depth: Int)] {
        document.paragraphLayout().filter { $0.range.length > 0 }.map { ($0.range, $0.depth) }
    }

    /// Index range of the block at `index` plus its indented children.
    private func subtree(_ index: Int, in paragraphs: [(range: NSRange, depth: Int)]) -> ClosedRange<Int> {
        var end = index
        while end + 1 < paragraphs.count, paragraphs[end + 1].depth > paragraphs[index].depth { end += 1 }
        return index...end
    }

    private func paragraphIndex(at location: Int, in paragraphs: [(range: NSRange, depth: Int)]) -> Int? {
        paragraphs.firstIndex { location >= $0.range.location && location < NSMaxRange($0.range) }
            ?? (paragraphs.last.map { location == NSMaxRange($0.range) && !text.substring(with: $0.range).hasSuffix("\n") } == true ? paragraphs.count - 1 : nil)
    }

    /// Paragraph indices (among paragraphs with characters) of the block at `location` and its
    /// children — what a drag of its handle moves.
    public func blockIndices(at location: Int) -> ClosedRange<Int>? {
        let paragraphs = movableParagraphs()
        return paragraphIndex(at: location, in: paragraphs).map { subtree($0, in: paragraphs) }
    }

    /// The deepest depth a block may take when inserted before paragraph `target` (drop
    /// indicator / keyboard move): one deeper than the paragraph above it.
    public func maxDepth(forMoveOf location: Int, before target: Int) -> Int {
        let paragraphs = movableParagraphs()
        guard let s = paragraphIndex(at: location, in: paragraphs) else { return 0 }
        let block = subtree(s, in: paragraphs)
        let above = target == block.upperBound + 1 ? s - 1 : target - 1
        guard above >= 0, above < paragraphs.count else { return 0 }
        return min(paragraphs[above].depth + 1, ParagraphSyntax.maxDepth)
    }

    /// Moves the block at `location` (with its children) so it sits before paragraph index
    /// `target` (`count` = at the end), at `depth` (clamped; children keep their relative
    /// indent). One undo step. Returns false for a no-op / invalid drop.
    @discardableResult
    public func moveBlock(at location: Int, before target: Int, depth requestedDepth: Int) -> Bool {
        let paragraphs = movableParagraphs()
        guard let s = paragraphIndex(at: location, in: paragraphs) else { return false }
        let block = subtree(s, in: paragraphs)
        let e = block.upperBound
        let t = max(0, min(target, paragraphs.count))
        if t > s, t <= e { return false } // into itself
        let oldDepth = paragraphs[s].depth
        let newDepth = max(0, min(requestedDepth, maxDepth(forMoveOf: location, before: t)))
        let stays = t == s || t == e + 1
        if stays, newDepth == oldDepth { return false }

        let order: [Int]
        let lo: Int, hi: Int
        if stays { order = Array(block); lo = s; hi = e }
        else if t < s { order = Array(block) + Array(t..<s); lo = t; hi = e }
        else { order = Array((e + 1)..<t) + Array(block); lo = s; hi = t - 1 }

        let delta = newDepth - oldDepth
        let result = NSMutableAttributedString()
        var rootOffset = 0
        for index in order {
            let piece = NSMutableAttributedString(attributedString: document.storage.attributedSubstring(from: paragraphs[index].range))
            if !piece.string.hasSuffix("\n") {
                var attrs = piece.length > 0 ? piece.attributes(at: piece.length - 1, effectiveRange: nil) : document.baseAttributes
                attrs.removeValue(forKey: .attachment)
                attrs.removeValue(forKey: .notionToken)
                piece.append(NSAttributedString(string: "\n", attributes: attrs))
            }
            if block.contains(index) {
                let depth = index == s ? newDepth : max(min(newDepth + 1, ParagraphSyntax.maxDepth), min(paragraphs[index].depth + delta, ParagraphSyntax.maxDepth))
                piece.addAttribute(.notionDepth, value: depth, range: NSRange(location: 0, length: piece.length))
                if index == s { rootOffset = result.length }
            }
            result.append(piece)
        }
        let region = NSRange(location: paragraphs[lo].range.location, length: NSMaxRange(paragraphs[hi].range) - paragraphs[lo].range.location)
        if !text.substring(with: region).hasSuffix("\n"), result.length > 0 {
            result.deleteCharacters(in: NSRange(location: result.length - 1, length: 1)) // document end
        }
        let caret = host?.editorSelection.location ?? location
        let caretOffset = (caret >= paragraphs[s].range.location && caret < NSMaxRange(paragraphs[s].range)) ? caret - paragraphs[s].range.location : 0
        undoStep("Move") {
            replace(region, with: result)
            select(region.location + rootOffset + caretOffset)
        }
        return true
    }

    /// ⌥⇧↑: the block at the caret (with its children) moves above the previous block.
    @discardableResult
    public func moveBlockUp() -> Bool {
        guard let host else { return false }
        let paragraphs = movableParagraphs()
        guard let s = paragraphIndex(at: host.editorSelection.location, in: paragraphs) else { return false }
        let depth = paragraphs[s].depth
        guard let p = (0..<s).last(where: { paragraphs[$0].depth <= depth }) else { return false }
        return moveBlock(at: host.editorSelection.location, before: p, depth: depth)
    }

    /// ⌥⇧↓: the block at the caret (with its children) moves below the next block (and its children).
    @discardableResult
    public func moveBlockDown() -> Bool {
        guard let host else { return false }
        let paragraphs = movableParagraphs()
        guard let s = paragraphIndex(at: host.editorSelection.location, in: paragraphs) else { return false }
        let next = subtree(s, in: paragraphs).upperBound + 1
        guard next < paragraphs.count else { return false }
        let target = subtree(next, in: paragraphs).upperBound + 1
        return moveBlock(at: host.editorSelection.location, before: target, depth: paragraphs[s].depth)
    }
}
