import AppKit

public extension NSAttributedString.Key {
    /// The Notion block id a paragraph *is* (absent = a new paragraph not yet in Notion).
    static let notionBlockID = NSAttributedString.Key("NotionDock.blockID")
    /// `ParagraphKind.tag` of the paragraph. THE kind: the text holds only content, no prefixes.
    static let notionBlockKind = NSAttributedString.Key("NotionDock.blockKind")
    /// Nesting depth (NSNumber 0...3), drawn as a left inset.
    static let notionDepth = NSAttributedString.Key("NotionDock.depth")
    /// Editor-local paragraph identity (UUID string), stable while the paragraph exists.
    static let notionLocalID = NSAttributedString.Key("NotionDock.localID")
    /// On a token chip's attachment character: `TokenInfo.encoded`.
    static let notionToken = NSAttributedString.Key("NotionDock.token")
    /// Set (true) on paragraphs hidden inside a collapsed toggle. Layout-only.
    static let notionHidden = NSAttributedString.Key("NotionDock.hidden")
    /// Inline formatting (true when set). Visual styling is derived from these.
    static let notionBold = NSAttributedString.Key("NotionDock.bold")
    static let notionItalic = NSAttributedString.Key("NotionDock.italic")
    static let notionStrike = NSAttributedString.Key("NotionDock.strike")
    static let notionCode = NSAttributedString.Key("NotionDock.code")
    /// Inline link target (URL). Deliberately not `.link`, so NSTextView doesn't make it clickable
    /// while editing; the styler renders it.
    static let notionLink = NSAttributedString.Key("NotionDock.link")

    /// The per-paragraph identity/style keys (never inline).
    static let notionParagraphKeys: [NSAttributedString.Key] = [.notionBlockID, .notionBlockKind, .notionDepth, .notionLocalID]
    static let notionInlineKeys: [NSAttributedString.Key] = [.notionBold, .notionItalic, .notionStrike, .notionCode, .notionLink]
}

/// A non-text block shown as a chip.
public struct TokenInfo: Equatable, Sendable {
    public let blockID: String
    public let type: String
    public let title: String

    public init(blockID: String, type: String, title: String) {
        self.blockID = blockID
        self.type = type
        self.title = title
    }

    var encoded: String { [blockID, type, title].joined(separator: "\u{1F}") }

    init?(encoded: String) {
        let parts = encoded.components(separatedBy: "\u{1F}")
        guard parts.count >= 3 else { return nil }
        self.init(blockID: parts[0], type: parts[1], title: parts[2...].joined(separator: "\u{1F}"))
    }
}

/// The page editor's text model: an `NSTextStorage` where ONE PARAGRAPH == ONE NOTION BLOCK, and
/// the text is only the blocks' content (Notion-style: Markdown is just an input shortcut).
///
/// Every paragraph's characters (content + terminator) carry its identity and style —
/// `.notionLocalID`, `.notionBlockID` (once it exists in Notion), `.notionBlockKind`,
/// `.notionDepth` — and inline formatting lives in `.notionBold`/… attributes. The storage's
/// delegate (this object) keeps identity exact on every character edit, whoever makes it:
/// - a paragraph's identity is taken from its first character that existed before the edit, so a
///   split (Enter) leaves the id on the part holding the original start, and a merge (Backspace
///   at a line start) keeps the first paragraph's id and kind (the other id vanishes → delete);
/// - a paragraph made only of new characters is new (no id, plain text at the same depth) unless
///   it carries an identity nobody else has (undo of a deletion, a moved line);
/// - an empty last paragraph has no characters at all, so its identity is held in `trailing`.
@MainActor
public final class EditorDocument: NSObject, NSTextStorageDelegate {
    public let storage = NSTextStorage()
    public weak var textView: NSTextView?

    /// Attributes for rebuilt/inserted text (font, color, paragraph style). Set by the app.
    public var baseAttributes: [NSAttributedString.Key: Any] = [:]
    /// Visual styling of the paragraphs intersecting a range. Must only change attributes, and must
    /// not call `beginEditing`/`endEditing` (it runs inside `processEditing`).
    public var styler: (@MainActor (NSTextStorage, NSRange) -> Void)?
    /// Builds the chip attachment for a token paragraph.
    public var attachmentFactory: @MainActor (TokenInfo) -> NSTextAttachment = { _ in NSTextAttachment() }
    /// Builds the inline picture attachment for an image paragraph.
    public var imageAttachmentFactory: @MainActor (ImageInfo) -> NSTextAttachment = { _ in NSTextAttachment() }
    /// Called after every local edit (characters or paragraph style) that isn't a rebuild.
    public var onLocalEdit: (@MainActor () -> Void)?

    public private(set) var editGeneration = 0
    public private(set) var lastLocalEditAt: Date?
    /// True while the document itself edits characters (token restore), so input guards in the
    /// text view can let it through.
    public internal(set) var isProgrammaticEdit = false
    /// Block ids that are tokens — a paragraph carrying one of these without its chip is not it.
    public private(set) var tokenBlockIDs = Set<String>()
    /// Collapsed toggles, keyed by block id (or local id before the toggle exists in Notion).
    /// Local only — never synced.
    public private(set) var collapsedToggles = Set<String>()

    struct Identity: Equatable {
        var localID: String
        var blockID: String?
        var kindTag: String = ParagraphKind.paragraph.tag
        var depth: Int = 0
        /// A new paragraph: plain text at the depth of `source` (the Enter command sets the kind
        /// explicitly — continuing a list — so raw splits and pastes default to text).
        static func fresh(styleOf source: Identity? = nil) -> Identity {
            Identity(localID: UUID().uuidString, blockID: nil, kindTag: ParagraphKind.paragraph.tag, depth: source?.depth ?? 0)
        }
        var kind: ParagraphKind { ParagraphKind(tag: kindTag) ?? .paragraph }
    }

    /// Identity of the empty last paragraph (which has no characters to carry attributes).
    private var trailing: Identity? = .fresh()
    /// Identity of the last paragraph as of the end of the previous edit, so a paragraph emptied
    /// by deleting all its text (it then has no characters) keeps being the same block.
    private var lastParagraphIdentity: Identity?
    private var isRebuilding = false
    private var isNormalizing = false

    public override init() {
        super.init()
        storage.delegate = self
    }

    public var isEmpty: Bool { storage.length == 0 }

    // MARK: - Rebuild from server state

    /// Replaces the whole text with `blocks` (server state, pre-order), one paragraph per block.
    /// Not a local edit. Keeps the caret on the same block + offset when `preserveSelection`.
    public func load(_ blocks: [SyncedParagraph], preserveSelection: Bool = true) {
        let anchor = preserveSelection ? selectionAnchor() : nil

        var depthOf: [String: Int] = [:]
        tokenBlockIDs = []
        let result = NSMutableAttributedString()
        var lastIdentity: Identity?
        var lastAttrs: [NSAttributedString.Key: Any]?
        var lastWasEmpty = true
        for (index, block) in blocks.enumerated() {
            let depth = min(block.parentID.flatMap { depthOf[$0].map { $0 + 1 } } ?? 0, ParagraphSyntax.maxDepth)
            depthOf[block.blockID] = depth
            let identity = Identity(localID: UUID().uuidString, blockID: block.blockID, kindTag: block.kind.tag, depth: depth)
            let attrs = paragraphAttributes(identity)

            let paragraph: NSAttributedString
            if case .token(let type, let title) = block.kind {
                tokenBlockIDs.insert(block.blockID)
                paragraph = tokenParagraph(TokenInfo(blockID: block.blockID, type: type, title: title), attrs: attrs)
            } else if case .image(let source) = block.kind {
                paragraph = imageParagraph(ImageInfo(blockID: block.blockID, source: ImageSource(encoded: source)), attrs: attrs)
            } else {
                paragraph = Self.attributedContent(block.spans, kind: block.kind, attributes: attrs)
            }
            if index > 0, let lastAttrs {
                result.append(NSAttributedString(string: "\n", attributes: lastAttrs))
            }
            result.append(paragraph)
            lastIdentity = identity
            lastAttrs = attrs
            lastWasEmpty = paragraph.length == 0
        }

        isRebuilding = true
        storage.beginEditing()
        storage.setAttributedString(result)
        storage.endEditing()
        isRebuilding = false
        trailing = (blocks.isEmpty || lastWasEmpty) ? (lastIdentity ?? .fresh()) : nil

        refreshHidden()
        cacheLastParagraph()
        restyle(NSRange(location: 0, length: storage.length))
        if let textView {
            textView.typingAttributes = baseAttributes
            textView.undoManager?.removeAllActions(withTarget: textView)
            textView.undoManager?.removeAllActions(withTarget: storage)
            if let anchor { restoreSelection(anchor) }
        }
    }

    /// Base attributes plus a paragraph's identity/style attributes.
    func paragraphAttributes(_ identity: Identity) -> [NSAttributedString.Key: Any] {
        var attrs = baseAttributes
        attrs[.notionLocalID] = identity.localID
        attrs[.notionBlockID] = identity.blockID
        attrs[.notionBlockKind] = identity.kindTag
        attrs[.notionDepth] = identity.depth
        return attrs
    }

    /// Rich text as attributed content (soft breaks as U+2028, formatting as inline attributes).
    public static func attributedContent(_ spans: [RichTextSpan], kind: ParagraphKind, attributes: [NSAttributedString.Key: Any]) -> NSAttributedString {
        let out = NSMutableAttributedString()
        for span in spans {
            var attrs = attributes
            if case .code = kind {} else {
                if span.bold { attrs[.notionBold] = true }
                if span.italic { attrs[.notionItalic] = true }
                if span.strikethrough { attrs[.notionStrike] = true }
                if span.code { attrs[.notionCode] = true }
                if let link = span.link { attrs[.notionLink] = link }
            }
            out.append(NSAttributedString(string: ParagraphSyntax.toSoftBreaks(span.text), attributes: attrs))
        }
        return out
    }

    /// Rich-text spans of `range` of an attributed string (inline attributes → annotations).
    public nonisolated static func spans(in text: NSAttributedString, range: NSRange) -> [RichTextSpan] {
        guard range.length > 0, NSMaxRange(range) <= text.length else { return [] }
        let ns = text.string as NSString
        var spans: [RichTextSpan] = []
        text.enumerateAttributes(in: range, options: []) { attrs, run, _ in
            var chunk = ns.substring(with: run)
            chunk = chunk.replacingOccurrences(of: ParagraphSyntax.attachmentCharacter, with: "")
            chunk = ParagraphSyntax.fromSoftBreaks(chunk)
            guard !chunk.isEmpty else { return }
            let link: URL? = (attrs[.notionLink] as? URL) ?? (attrs[.notionLink] as? String).flatMap(URL.init(string:))
            spans.append(RichTextSpan(
                text: chunk,
                bold: attrs[.notionBold] != nil,
                italic: attrs[.notionItalic] != nil,
                strikethrough: attrs[.notionStrike] != nil,
                code: attrs[.notionCode] != nil,
                link: link
            ))
        }
        return SpanRuns.normalize(spans)
    }

    private func tokenParagraph(_ info: TokenInfo, attrs: [NSAttributedString.Key: Any]) -> NSAttributedString {
        let chip = NSMutableAttributedString(attachment: attachmentFactory(info))
        var chipAttrs = attrs
        chipAttrs[.notionToken] = info.encoded
        chip.addAttributes(chipAttrs, range: NSRange(location: 0, length: chip.length))
        return chip
    }

    // MARK: - Reading paragraphs

    /// All paragraphs in order, including an empty last one. Empty lines are real paragraphs.
    public func paragraphs() -> [DocParagraph] {
        let ns = storage.string as NSString
        return paragraphRanges(in: NSRange(location: 0, length: ns.length)).map { range in
            let identity = self.identity(of: range) ?? {
                let fresh = Identity.fresh()
                apply(fresh, to: range)
                return fresh
            }()
            let (kind, spans, depth) = describe(range, identity: identity)
            return DocParagraph(localID: identity.localID, blockID: identity.blockID, kind: kind, spans: spans, depth: depth)
        }
    }

    /// Lightweight per-paragraph info for drawing: range (incl. terminator), kind, depth.
    public func paragraphLayout() -> [(range: NSRange, kind: ParagraphKind, depth: Int)] {
        paragraphRanges(in: NSRange(location: 0, length: storage.length)).map { range in
            let identity = identity(of: range)
            let kind: ParagraphKind = token(inParagraph: range).map { .token(type: $0.type, title: $0.title) } ?? identity?.kind ?? .paragraph
            return (range, kind, identity?.depth ?? 0)
        }
    }

    /// The paragraph containing `location` (content range excludes the terminator).
    public func paragraphRange(at location: Int) -> (range: NSRange, content: NSRange) {
        let ns = storage.string as NSString
        let loc = max(0, min(location, ns.length))
        if loc == ns.length, endsWithEmptyParagraph(ns) {
            return (NSRange(location: loc, length: 0), NSRange(location: loc, length: 0))
        }
        var start = 0, end = 0, contentsEnd = 0
        ns.getParagraphStart(&start, end: &end, contentsEnd: &contentsEnd, for: NSRange(location: loc, length: 0))
        return (NSRange(location: start, length: end - start), NSRange(location: start, length: contentsEnd - start))
    }

    public func kind(at location: Int) -> ParagraphKind {
        let range = paragraphRange(at: location).range
        if let token = token(inParagraph: range) { return .token(type: token.type, title: token.title) }
        return identity(of: range)?.kind ?? .paragraph
    }

    public func depth(at location: Int) -> Int {
        identity(of: paragraphRange(at: location).range)?.depth ?? 0
    }

    public func localID(at location: Int) -> String? {
        identity(of: paragraphRange(at: location).range)?.localID
    }

    /// Start of the paragraph with `localID`, if it still exists.
    public func location(ofLocalID localID: String) -> Int? {
        if trailing?.localID == localID { return storage.length }
        return rangeOfParagraph(localID: localID)?.location
    }

    public func blockID(forLocalID localID: String) -> String? {
        if trailing?.localID == localID { return trailing?.blockID }
        guard let range = rangeOfParagraph(localID: localID) else { return nil }
        return identity(of: range)?.blockID
    }

    public func token(inParagraph range: NSRange) -> TokenInfo? {
        Self.tokenInfo(in: storage, range: range)
    }

    /// The token chip in `range`: a U+FFFC attachment character carrying `.notionToken` (the
    /// attribute alone isn't enough — NSTextView copies it into typing attributes).
    public nonisolated static func tokenInfo(in text: NSAttributedString, range: NSRange) -> TokenInfo? {
        guard range.length > 0, NSMaxRange(range) <= text.length else { return nil }
        let ns = text.string as NSString
        var found: TokenInfo?
        text.enumerateAttribute(.notionToken, in: range, options: []) { value, run, stop in
            guard let s = value as? String, let info = TokenInfo(encoded: s) else { return }
            for i in run.location..<NSMaxRange(run) where ns.character(at: i) == 0xFFFC {
                found = info
                stop.pointee = true
                return
            }
        }
        return found
    }

    private func describe(_ range: NSRange, identity: Identity?) -> (ParagraphKind, [RichTextSpan], Int) {
        let depth = identity?.depth ?? 0
        if let token = token(inParagraph: range) {
            return (.token(type: token.type, title: token.title), [], depth)
        }
        let kind = identity?.kind ?? .paragraph
        let content = contentRange(of: range)
        switch kind {
        case .code:
            let text = ParagraphSyntax.fromSoftBreaks((storage.string as NSString).substring(with: content))
            return (kind, text.isEmpty ? [] : [RichTextSpan(text: text)], depth)
        case .divider:
            return (kind, [], depth)
        default:
            return (kind, Self.spans(in: storage, range: content), depth)
        }
    }

    // MARK: - Paragraph style (kind + depth)

    /// Sets the kind and/or depth of the paragraph at `location`. Attribute-only (caret and text
    /// stay) but a local edit (schedules a sync). Returns the previous style, or nil if unchanged.
    @discardableResult
    public func setStyle(kind: ParagraphKind? = nil, depth: Int? = nil, forParagraphAt location: Int) -> (kind: ParagraphKind, depth: Int)? {
        let range = paragraphRange(at: location).range
        guard var identity = identity(of: range) else { return nil }
        let old = (identity.kind, identity.depth)
        if let kind { identity.kindTag = kind.tag }
        if let depth { identity.depth = max(0, min(depth, ParagraphSyntax.maxDepth)) }
        guard identity.kindTag != old.0.tag || identity.depth != old.1 else { return nil }
        apply(identity, to: range)
        cacheLastParagraph()
        noteLocalEdit(restyling: range)
        return old
    }

    /// Records an attribute-only local change (inline formatting via the text view, undo of one)
    /// so it gets synced.
    public func noteLocalEdit(restyling range: NSRange? = nil) {
        refreshHidden()
        editGeneration += 1
        lastLocalEditAt = Date()
        if let range { restyle(range) }
        onLocalEdit?()
    }

    // MARK: - Collapsed toggles

    private func collapseKey(_ identity: Identity) -> String { identity.blockID ?? identity.localID }

    public func isCollapsed(paragraphAt location: Int) -> Bool {
        let range = paragraphRange(at: location).range
        guard let identity = identity(of: range) else { return false }
        return collapsedToggles.contains(collapseKey(identity))
    }

    /// Collapses/expands the toggle at `location` (local state only; no sync).
    public func toggleCollapsed(paragraphAt location: Int) {
        let range = paragraphRange(at: location).range
        guard let identity = identity(of: range), identity.kind == .toggle else { return }
        let key = collapseKey(identity)
        if collapsedToggles.contains(key) { collapsedToggles.remove(key) } else { collapsedToggles.insert(key) }
        storage.beginEditing()
        refreshHidden()
        storage.endEditing()
    }

    /// Ranges hidden inside collapsed toggles: each collapsed toggle's following paragraphs that
    /// are indented deeper than it.
    public func hiddenRanges() -> [NSRange] {
        guard !collapsedToggles.isEmpty else { return [] }
        let layout = paragraphRanges(in: NSRange(location: 0, length: storage.length)).map { ($0, identity(of: $0)) }
        var result: [NSRange] = []
        var i = 0
        while i < layout.count {
            if let identity = layout[i].1, identity.kind == .toggle, collapsedToggles.contains(collapseKey(identity)) {
                let depth = identity.depth
                var j = i + 1
                while j < layout.count, (layout[j].1?.depth ?? 0) > depth { j += 1 }
                if j > i + 1 {
                    let start = layout[i + 1].0.location
                    result.append(NSRange(location: start, length: NSMaxRange(layout[j - 1].0) - start))
                }
                i = j
            } else {
                i += 1
            }
        }
        return result.filter { $0.length > 0 }
    }

    /// Brings the `.notionHidden` attribute in line with `hiddenRanges()` (only touching the
    /// storage when it changes, so layout isn't invalidated on every keystroke).
    private func refreshHidden() {
        let desired = hiddenRanges()
        var current: [NSRange] = []
        storage.enumerateAttribute(.notionHidden, in: NSRange(location: 0, length: storage.length), options: []) { value, range, _ in
            if value != nil { current.append(range) }
        }
        guard desired != current else { return }
        for range in current { storage.removeAttribute(.notionHidden, range: range) }
        for range in desired { storage.addAttribute(.notionHidden, value: true, range: range) }
    }

    // MARK: - Applying confirmed server ids

    /// Sets the Notion id on the paragraph with `localID` (wherever it is now). Attribute-only:
    /// no text change, so the caret and undo stack are untouched. Returns false if it's gone.
    @discardableResult
    public func setBlockID(_ blockID: String, forLocalID localID: String) -> Bool {
        if trailing?.localID == localID { trailing?.blockID = blockID; cacheLastParagraph(); return true }
        guard let range = rangeOfParagraph(localID: localID) else { return false }
        storage.addAttribute(.notionBlockID, value: blockID, range: range)
        cacheLastParagraph()
        return true
    }

    /// Forgets `blockID` wherever it is (e.g. the block turned out to be deleted in Notion): the
    /// paragraph becomes new and will be inserted on the next sync.
    public func clearBlockID(_ blockID: String) {
        if trailing?.blockID == blockID { trailing?.blockID = nil }
        var ranges: [NSRange] = []
        storage.enumerateAttribute(.notionBlockID, in: NSRange(location: 0, length: storage.length), options: []) { value, range, _ in
            if (value as? String) == blockID { ranges.append(range) }
        }
        for range in ranges { storage.removeAttribute(.notionBlockID, range: range) }
        cacheLastParagraph()
    }

    // MARK: - Token restore

    /// Puts a token chip back (its line was deleted), right after the paragraph of `afterBlockID`
    /// (or at the top). Goes through the text view when there is one, so undo stays consistent.
    public func restoreToken(_ info: TokenInfo, depth: Int, afterBlockID: String?) {
        tokenBlockIDs.insert(info.blockID)
        let ns = storage.string as NSString
        // Insert "\n" + chip at the end of the anchor paragraph's content: the anchor keeps its
        // own identity (its original characters) and nothing after it is touched.
        var location = 0
        var chipFirst = true
        if let afterBlockID {
            if let range = rangeOfParagraph(blockID: afterBlockID) {
                location = NSMaxRange(contentRange(of: range))
                chipFirst = false
            } else if ns.length > 0 {
                location = ns.length
                chipFirst = false
            }
        }

        let identity = Identity(localID: UUID().uuidString, blockID: info.blockID, kindTag: ParagraphKind.token(type: info.type, title: info.title).tag, depth: depth)
        let attrs = paragraphAttributes(identity)
        let chip = tokenParagraph(info, attrs: attrs)
        let insertion = NSMutableAttributedString()
        let chipLocation: Int
        if chipFirst {
            insertion.append(chip)
            insertion.append(NSAttributedString(string: "\n", attributes: attrs))
            chipLocation = location
        } else {
            insertion.append(NSAttributedString(string: "\n", attributes: baseAttributes))
            insertion.append(chip)
            chipLocation = location + 1
        }

        let selection = textView?.selectedRange()
        let range = NSRange(location: location, length: 0)
        isProgrammaticEdit = true
        if let textView, textView.shouldChangeText(in: range, replacementString: insertion.string) {
            storage.replaceCharacters(in: range, with: insertion)
            textView.didChangeText()
        } else {
            storage.replaceCharacters(in: range, with: insertion)
        }
        isProgrammaticEdit = false

        // Force the chip paragraph's identity to be the token's, whatever normalization decided.
        apply(identity, to: paragraphRange(at: chipLocation).range)
        if let selection, let textView {
            let shifted = selection.location > location ? selection.location + insertion.length : selection.location
            textView.setSelectedRange(NSRange(location: min(shifted, storage.length), length: 0))
        }
    }

    // MARK: - Identity maintenance (NSTextStorageDelegate)

    public nonisolated func textStorage(_ textStorage: NSTextStorage, didProcessEditing editedMask: NSTextStorageEditActions, range editedRange: NSRange, changeInLength delta: Int) {
        MainActor.assumeIsolated {
            self.processEdit(mask: editedMask, edited: editedRange, delta: delta)
        }
    }

    private struct Candidate {
        var range: NSRange
        var identity: Identity?
        var original: Bool
        /// Where a new paragraph's style comes from when its identity is dropped.
        var styleSource: Identity?
    }

    private func processEdit(mask: NSTextStorageEditActions, edited: NSRange, delta: Int) {
        guard mask.contains(.editedCharacters), !isRebuilding, !isNormalizing else { return }
        isNormalizing = true
        defer { isNormalizing = false }

        let ns = storage.string as NSString
        let length = ns.length
        let preLength = length - delta
        let previousTrailing = trailing
        let editEnd = NSMaxRange(edited)
        let pureAppend = previousTrailing != nil && delta > 0 && edited.length == delta && edited.location == preLength

        // Every paragraph that holds an edited character, or starts right after the edit (the
        // second half of a split).
        let spanStart = paragraphRange(at: edited.location).range.location
        let spanEnd = editEnd < length ? NSMaxRange(paragraphRange(at: editEnd).range) : length
        let span = NSRange(location: spanStart, length: spanEnd - spanStart)
        let ranges = paragraphRanges(in: span)
        sanitizeTokenAttributes(in: span)

        var candidates: [Candidate] = ranges.map { range in
            if pureAppend && range.location == edited.location {
                return Candidate(range: range, identity: previousTrailing, original: true, styleSource: previousTrailing)
            }
            if range.length == 0 {
                // The empty last paragraph: still the same one unless text was just appended
                // into it (then that text took its identity and this is a new empty tail).
                let identity = pureAppend ? nil : (previousTrailing ?? lastParagraphIdentity)
                return Candidate(range: range, identity: identity, original: true, styleSource: identity ?? self.identity(at: range.location - 1))
            }
            // First character of this paragraph that existed before the edit.
            var originalPosition: Int?
            if range.location < edited.location {
                originalPosition = range.location
            } else if editEnd < NSMaxRange(range) {
                originalPosition = max(range.location, editEnd)
            }
            if let pos = originalPosition {
                let identity = identity(at: pos)
                return Candidate(range: range, identity: identity, original: true, styleSource: identity)
            }
            let carried = identity(at: range.location)
            return Candidate(range: range, identity: carried, original: false, styleSource: carried)
        }

        // Resolve duplicates: originals first, in order (the earliest keeps the id).
        var claimed = Set<String>()
        for i in candidates.indices where candidates[i].original {
            if let id = candidates[i].identity, !claimed.contains(id.localID) {
                claimed.insert(id.localID)
            } else {
                candidates[i].identity = nil
            }
        }
        // All-new paragraphs keep a carried identity only if it's unique in the whole document.
        var outside: Set<String>?
        for i in candidates.indices where !candidates[i].original {
            guard let id = candidates[i].identity else { continue }
            if outside == nil { outside = localIDs(excluding: span, trailing: ranges.last?.length == 0 || pureAppend ? nil : previousTrailing) }
            if claimed.contains(id.localID) || outside!.contains(id.localID) {
                candidates[i].identity = nil
            } else {
                claimed.insert(id.localID)
            }
        }

        for candidate in candidates {
            var identity = candidate.identity ?? .fresh(styleOf: candidate.styleSource)
            let chip = token(inParagraph: candidate.range)
            if let blockID = identity.blockID, tokenBlockIDs.contains(blockID), chip == nil {
                identity = .fresh(styleOf: nil) // the chip was deleted from this line: it's not that block anymore
                identity.depth = candidate.styleSource?.depth ?? 0
            } else if chip == nil, identity.kind.isToken {
                identity.kindTag = ParagraphKind.paragraph.tag
            } else if identity.kind.isImage, !containsAttachment(candidate.range) {
                // The picture was deleted from this line: it's a new text paragraph now.
                identity = .fresh(styleOf: candidate.styleSource)
            } else if identity.kind == .divider, contentRange(of: candidate.range).length > 0 {
                identity.kindTag = ParagraphKind.paragraph.tag // text landed in a divider: it's text now
            }
            if candidate.range.length == 0 {
                trailing = identity
            } else {
                apply(identity, to: candidate.range)
            }
        }
        if !endsWithEmptyParagraph(ns) {
            trailing = nil
        } else if ranges.last?.length != 0 || ranges.isEmpty {
            trailing = (pureAppend ? nil : previousTrailing) ?? .fresh(styleOf: identity(at: length - 1))
        }

        refreshHidden()
        cacheLastParagraph()
        editGeneration += 1
        lastLocalEditAt = Date()
        restyle(span)
        onLocalEdit?()
    }

    func cacheLastParagraph() {
        let ns = storage.string as NSString
        lastParagraphIdentity = endsWithEmptyParagraph(ns) ? trailing : identity(at: ns.length - 1)
    }

    // MARK: - Helpers

    private func restyle(_ range: NSRange) {
        guard let styler, storage.length > 0 else { return }
        let clamped = NSIntersectionRange(range, NSRange(location: 0, length: storage.length))
        if isNormalizing {
            styler(storage, clamped)
        } else {
            storage.beginEditing()
            styler(storage, clamped)
            storage.endEditing()
        }
    }

    func apply(_ identity: Identity, to range: NSRange) {
        guard range.length > 0 else {
            if range.location == storage.length { trailing = identity }
            return
        }
        storage.addAttribute(.notionLocalID, value: identity.localID, range: range)
        if let blockID = identity.blockID {
            storage.addAttribute(.notionBlockID, value: blockID, range: range)
        } else {
            storage.removeAttribute(.notionBlockID, range: range)
        }
        storage.addAttribute(.notionBlockKind, value: identity.kindTag, range: range)
        storage.addAttribute(.notionDepth, value: identity.depth, range: range)
    }

    private func identity(at position: Int) -> Identity? {
        guard position >= 0, position < storage.length else { return nil }
        guard let localID = storage.attribute(.notionLocalID, at: position, effectiveRange: nil) as? String else { return nil }
        return Identity(
            localID: localID,
            blockID: storage.attribute(.notionBlockID, at: position, effectiveRange: nil) as? String,
            kindTag: storage.attribute(.notionBlockKind, at: position, effectiveRange: nil) as? String ?? ParagraphKind.paragraph.tag,
            depth: (storage.attribute(.notionDepth, at: position, effectiveRange: nil) as? Int) ?? 0
        )
    }

    func identity(of paragraph: NSRange) -> Identity? {
        paragraph.length == 0 ? trailing : identity(at: paragraph.location)
    }

    func contentRange(of paragraph: NSRange) -> NSRange {
        guard paragraph.length > 0 else { return paragraph }
        let ns = storage.string as NSString
        var start = 0, end = 0, contentsEnd = 0
        ns.getParagraphStart(&start, end: &end, contentsEnd: &contentsEnd, for: NSRange(location: paragraph.location, length: 0))
        return NSRange(location: paragraph.location, length: contentsEnd - paragraph.location)
    }

    /// Removes `.notionToken` from characters that aren't a chip (inherited via typing attributes).
    private func sanitizeTokenAttributes(in range: NSRange) {
        guard range.length > 0 else { return }
        let ns = storage.string as NSString
        var strays: [NSRange] = []
        storage.enumerateAttribute(.notionToken, in: range, options: []) { value, run, _ in
            guard value != nil else { return }
            for i in run.location..<NSMaxRange(run) where ns.character(at: i) != 0xFFFC {
                strays.append(NSRange(location: i, length: 1))
            }
        }
        for stray in strays { storage.removeAttribute(.notionToken, range: stray) }
    }

    /// Paragraph ranges (content + terminator) covering `span`, plus the empty last paragraph when
    /// `span` reaches the end of a document that ends with one.
    func paragraphRanges(in span: NSRange) -> [NSRange] {
        let ns = storage.string as NSString
        var ranges: [NSRange] = []
        var location = span.location
        while location < NSMaxRange(span), location < ns.length {
            let range = ns.paragraphRange(for: NSRange(location: location, length: 0))
            ranges.append(range)
            location = NSMaxRange(range)
        }
        if NSMaxRange(span) >= ns.length, endsWithEmptyParagraph(ns) {
            ranges.append(NSRange(location: ns.length, length: 0))
        }
        return ranges
    }

    private func endsWithEmptyParagraph(_ ns: NSString) -> Bool {
        guard ns.length > 0 else { return true }
        let last = ns.character(at: ns.length - 1)
        return last == 0x0A || last == 0x0D || last == 0x2029
    }

    private func localIDs(excluding span: NSRange, trailing: Identity?) -> Set<String> {
        var ids = Set<String>()
        let full = NSRange(location: 0, length: storage.length)
        for part in [NSRange(location: 0, length: span.location), NSRange(location: NSMaxRange(span), length: full.length - NSMaxRange(span))] where part.length > 0 {
            storage.enumerateAttribute(.notionLocalID, in: part, options: []) { value, _, _ in
                if let id = value as? String { ids.insert(id) }
            }
        }
        if let trailing { ids.insert(trailing.localID) }
        return ids
    }

    func rangeOfParagraph(localID: String) -> NSRange? {
        rangeOfParagraph(key: .notionLocalID, value: localID)
    }

    private func rangeOfParagraph(blockID: String) -> NSRange? {
        if trailing?.blockID == blockID { return NSRange(location: storage.length, length: 0) }
        return rangeOfParagraph(key: .notionBlockID, value: blockID)
    }

    private func rangeOfParagraph(key: NSAttributedString.Key, value: String) -> NSRange? {
        var found: NSRange?
        storage.enumerateAttribute(key, in: NSRange(location: 0, length: storage.length), options: []) { v, range, stop in
            if (v as? String) == value { found = range; stop.pointee = true }
        }
        guard let found else { return nil }
        return (storage.string as NSString).paragraphRange(for: NSRange(location: found.location, length: 0))
    }

    // MARK: - Selection by block identity

    private struct SelectionAnchor {
        var blockID: String?
        var offset: Int
        var length: Int
        var fallback: Int
    }

    private func selectionAnchor() -> SelectionAnchor? {
        guard let textView else { return nil }
        let selection = textView.selectedRange()
        let paragraph = paragraphRange(at: selection.location).range
        return SelectionAnchor(blockID: identity(of: paragraph)?.blockID, offset: selection.location - paragraph.location, length: selection.length, fallback: selection.location)
    }

    private func restoreSelection(_ anchor: SelectionAnchor) {
        guard let textView else { return }
        var location = min(anchor.fallback, storage.length)
        if let blockID = anchor.blockID, let paragraph = rangeOfParagraph(blockID: blockID) {
            let content = contentRange(of: paragraph)
            location = content.location + min(anchor.offset, content.length)
        }
        let length = min(anchor.length, storage.length - location)
        textView.setSelectedRange(NSRange(location: location, length: max(0, length)))
    }
}
