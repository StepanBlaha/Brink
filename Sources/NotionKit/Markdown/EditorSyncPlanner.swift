import Foundation

/// One paragraph of the editor as it is *now* (the "current" side of a sync plan).
public struct DocParagraph: Equatable, Sendable {
    /// Editor-local identity, stable while the paragraph exists (survives typing, even during an
    /// in-flight insert request). Used to attach the Notion id an insert returns.
    public var localID: String
    /// The Notion block this paragraph is, or `nil` for a paragraph that doesn't exist in Notion yet.
    public var blockID: String?
    public var kind: ParagraphKind
    /// Comparison key of the rich text (`SpanRuns.key`): what the planner diffs.
    public var content: String
    /// Nesting depth (0...3).
    public var depth: Int
    /// The rich text, built from the paragraph's attributes — what gets sent to Notion.
    public var spans: [RichTextSpan]

    /// `content` given as inline Markdown (convenience for tests and imports).
    public init(localID: String = UUID().uuidString, blockID: String?, kind: ParagraphKind, content: String, depth: Int = 0) {
        self.init(localID: localID, blockID: blockID, kind: kind, spans: SpanRuns.spans(fromContent: content, kind: kind), depth: depth)
    }

    public init(localID: String = UUID().uuidString, blockID: String?, kind: ParagraphKind, spans: [RichTextSpan], depth: Int = 0) {
        self.localID = localID
        self.blockID = blockID
        self.kind = kind
        self.spans = SpanRuns.normalize(spans)
        self.content = SpanRuns.key(spans, kind: kind)
        self.depth = depth
    }
}

/// One block of the last server-confirmed page state (the "previous" side of a sync plan), in
/// document (pre-order) order. Only ever updated from confirmed API results.
public struct SyncedParagraph: Equatable, Sendable, Codable {
    public var blockID: String
    /// `nil` = a top-level block of the page.
    public var parentID: String?
    public var kind: ParagraphKind
    /// Comparison key of the rich text (`SpanRuns.key`).
    public var content: String
    public var spans: [RichTextSpan]
    /// The block has children the editor doesn't show (depth cap, toggle heading, …). Such a block
    /// is never recreated (that would silently drop those children).
    public var hasHiddenChildren: Bool

    /// `content` given as inline Markdown (convenience for tests).
    public init(blockID: String, parentID: String? = nil, kind: ParagraphKind, content: String, hasHiddenChildren: Bool = false) {
        self.init(blockID: blockID, parentID: parentID, kind: kind, spans: SpanRuns.spans(fromContent: content, kind: kind), hasHiddenChildren: hasHiddenChildren)
    }

    public init(blockID: String, parentID: String? = nil, kind: ParagraphKind, spans: [RichTextSpan], hasHiddenChildren: Bool = false) {
        self.blockID = blockID
        self.parentID = parentID
        self.kind = kind
        self.spans = SpanRuns.normalize(spans)
        self.content = SpanRuns.key(spans, kind: kind)
        self.hasHiddenChildren = hasHiddenChildren
    }

    /// Replaces kind + rich text (after a confirmed update).
    mutating func set(kind: ParagraphKind, spans: [RichTextSpan]) {
        self.kind = kind
        self.spans = SpanRuns.normalize(spans)
        self.content = SpanRuns.key(spans, kind: kind)
    }
}

public enum InsertParent: Equatable, Sendable {
    case page
    case block(String)
    /// A block inserted earlier in the same plan; resolved by its paragraph's local id.
    case pending(localID: String)
}

public enum InsertPosition: Equatable, Sendable {
    case start
    case after(blockID: String)
    case afterPending(localID: String)
}

public enum EditorSyncOp: Equatable, Sendable {
    /// In-place text/checked/language update of an existing block.
    case update(blockID: String, kind: ParagraphKind, content: String)
    /// Consecutive new sibling paragraphs, created with one `appendBlocks` call (≤ 100).
    case insert(parent: InsertParent, position: InsertPosition, paragraphs: [DocParagraph])
    case delete(blockID: String)
    /// A token block whose chip disappeared from the text: never deleted in Notion — the chip is
    /// put back locally, after `afterBlockID` (or at the top).
    case restoreToken(SyncedParagraph, depth: Int, afterBlockID: String?)
}

/// Pure, exact-identity sync planning: every paragraph carries the Notion id it *is* (or none),
/// so there is no guessing — same id ⇒ same block. Diffing is per paragraph:
/// - same id, same parent, same API type, in order → `update` if content changed;
/// - no id / id unknown to the server / type changed / parent changed / reordered → `insert`
///   (and the old block, if any, gets a `delete`);
/// - previous ids no longer present → `delete` (tokens → `restoreToken` instead).
public enum EditorSyncPlanner {
    public static let maxBlocksPerAppend = 100

    public static func plan(previous: [SyncedParagraph], current: [DocParagraph]) -> [EditorSyncOp] {
        let n = current.count
        var prevIndex: [String: Int] = [:]
        for (i, p) in previous.enumerated() where prevIndex[p.blockID] == nil { prevIndex[p.blockID] = i }

        // 1. Structural parent of every current paragraph: nearest previous paragraph with a
        // smaller indent, walking up past kinds that can't have children.
        var parentIdx = [Int?](repeating: nil, count: n)
        var stack: [(depth: Int, index: Int)] = []
        for i in 0..<n {
            let depth = max(0, min(current[i].depth, ParagraphSyntax.maxDepth))
            while let top = stack.last, top.depth >= depth { stack.removeLast() }
            var p = stack.last?.index
            while let pi = p, !current[pi].kind.canHaveChildren { p = parentIdx[pi] }
            parentIdx[i] = p
            stack.append((depth, i))
        }

        // 2. Candidate retention (document order, so a parent is decided before its children).
        var retained = [String?](repeating: nil, count: n)
        var placed = [Bool](repeating: false, count: n) // retained AND at its server parent
        var used = Set<String>()
        func serverParentMatches(_ i: Int, _ prev: SyncedParagraph) -> Bool {
            guard let p = parentIdx[i] else { return prev.parentID == nil }
            guard let parentID = retained[p] else { return false }
            return parentID == prev.parentID
        }
        for i in 0..<n {
            let c = current[i]
            guard let id = c.blockID, let pi = prevIndex[id], !used.contains(id) else { continue }
            let prev = previous[pi]
            if prev.kind.isToken || c.kind.isToken {
                // Tokens are pinned: kept whenever still present, never recreated.
                guard prev.kind.isToken, c.kind.isToken else { continue }
                retained[i] = id
                placed[i] = serverParentMatches(i, prev)
                used.insert(id)
                continue
            }
            let parentOK = serverParentMatches(i, prev)
            if (prev.kind.apiType == c.kind.apiType && parentOK) || prev.hasHiddenChildren {
                retained[i] = id
                placed[i] = parentOK
                used.insert(id)
            }
        }

        // 3. Order: within each parent, retained blocks must keep their server order. Keep the
        // heaviest increasing run of server positions; the rest are recreated. This is how a pure
        // move (same id, different order — Notion can't move blocks) becomes "recreate at the new
        // position + delete the old one": the most blocks stay put, and among equal choices the
        // cheaper recreate wins (fewer descendants). Blocks that can't be recreated faithfully
        // (hidden children, images) are all but pinned.
        var subtreeSize = [Int](repeating: 1, count: n)
        for i in stride(from: n - 1, through: 0, by: -1) {
            if let p = parentIdx[i] { subtreeSize[p] += subtreeSize[i] }
        }
        var groups: [String: [Int]] = [:]
        for i in 0..<n where retained[i] != nil && placed[i] && !current[i].kind.isToken {
            let key = parentIdx[i].flatMap { retained[$0] } ?? "#page"
            groups[key, default: []].append(i)
        }
        for (_, members) in groups where members.count > 1 {
            let positions = members.map { prevIndex[retained[$0]!]! }
            let weights = members.map { i -> Int in
                let prev = previous[prevIndex[retained[i]!]!]
                if prev.hasHiddenChildren || current[i].kind.isImage { return 1_000_000 }
                return 1_000 + min(subtreeSize[i], 999)
            }
            let keep = Set(heaviestIncreasingSubsequence(positions, weights: weights).map { members[$0] })
            for i in members where !keep.contains(i) {
                retained[i] = nil
                placed[i] = false
            }
        }

        // 4. Cascade: a child whose parent is being recreated must be recreated under it.
        for i in 0..<n {
            guard let id = retained[i], !current[i].kind.isToken, let pi = prevIndex[id] else { continue }
            let prev = previous[pi]
            if !serverParentMatches(i, prev) {
                if prev.hasHiddenChildren { placed[i] = false } else { retained[i] = nil; placed[i] = false }
            }
        }

        var ops: [EditorSyncOp] = []
        let retainedSet = Set(retained.compactMap { $0 })

        // 5. Token restores (local only), anchored after the nearest earlier surviving block.
        var depthOf: [String: Int] = [:]
        for p in previous { depthOf[p.blockID] = p.parentID.flatMap { depthOf[$0].map { $0 + 1 } } ?? 0 }
        var lastSurvivor: String?
        for prev in previous {
            if prev.kind.isToken && !retainedSet.contains(prev.blockID) {
                ops.append(.restoreToken(prev, depth: depthOf[prev.blockID] ?? 0, afterBlockID: lastSurvivor))
                lastSurvivor = prev.blockID
            } else if retainedSet.contains(prev.blockID) {
                lastSurvivor = prev.blockID
            }
        }

        // 6. Updates and inserts, in document order.
        var lastChild: [Int: Int] = [:] // parent index (-1 = page) -> last placed child index
        func parentKey(_ i: Int) -> Int { parentIdx[i] ?? -1 }
        var i = 0
        while i < n {
            let c = current[i]
            if let id = retained[i] {
                // Images are never updated in place (only inserted/deleted).
                if !c.kind.isToken, !c.kind.isImage, let prev = prevIndex[id].map({ previous[$0] }) {
                    let kind = prev.kind.apiType == c.kind.apiType ? c.kind : prev.kind
                    if kind != prev.kind || c.content != prev.content {
                        ops.append(.update(blockID: id, kind: kind, content: c.content))
                    }
                }
                if placed[i] { lastChild[parentKey(i)] = i }
                i += 1
                continue
            }
            if c.kind.isToken { i += 1; continue } // an unknown chip (e.g. pasted): can't be created

            let key = parentKey(i)
            let parent: InsertParent
            if let p = parentIdx[i] {
                parent = retained[p].map { .block($0) } ?? .pending(localID: current[p].localID)
            } else {
                parent = .page
            }
            let position: InsertPosition
            if let j = lastChild[key] {
                position = retained[j].map { .after(blockID: $0) } ?? .afterPending(localID: current[j].localID)
            } else {
                position = .start
            }
            var batch = [c]
            lastChild[key] = i
            i += 1
            while i < n, batch.count < maxBlocksPerAppend, retained[i] == nil, !current[i].kind.isToken, parentKey(i) == key {
                batch.append(current[i])
                lastChild[key] = i
                i += 1
            }
            ops.append(.insert(parent: parent, position: position, paragraphs: batch))
        }

        // 7. Deletes: server blocks no longer present (or being recreated). Only the top-most of
        // a deleted subtree (Notion trashes descendants), never a subtree holding a token.
        let deleted = Set(previous.filter { !$0.kind.isToken && !retainedSet.contains($0.blockID) }.map(\.blockID))
        var tokenAncestors = Set<String>()
        var parentOf: [String: String] = [:]
        for p in previous { if let parent = p.parentID { parentOf[p.blockID] = parent } }
        for p in previous where p.kind.isToken {
            var cursor = p.parentID
            while let id = cursor { tokenAncestors.insert(id); cursor = parentOf[id] }
        }
        for prev in previous where deleted.contains(prev.blockID) {
            if let parent = prev.parentID, deleted.contains(parent), !tokenAncestors.contains(parent) { continue }
            if tokenAncestors.contains(prev.blockID) { continue }
            ops.append(.delete(blockID: prev.blockID))
        }
        return ops
    }

    /// Indices (into `values`) of a strictly increasing subsequence with the largest total weight
    /// (ties: the earliest found). O(n²) — groups are one parent's children.
    static func heaviestIncreasingSubsequence(_ values: [Int], weights: [Int]) -> [Int] {
        guard !values.isEmpty else { return [] }
        var best = weights
        var prev = [Int](repeating: -1, count: values.count)
        for i in values.indices {
            for j in 0..<i where values[j] < values[i] && best[j] + weights[i] > best[i] {
                best[i] = best[j] + weights[i]
                prev[i] = j
            }
        }
        var k = best.indices.max(by: { best[$0] < best[$1] || (best[$0] == best[$1] && $0 > $1) })!
        var result: [Int] = []
        while k >= 0 { result.append(k); k = prev[k] }
        return result.reversed()
    }

    /// Indices (into `values`) of one longest strictly increasing subsequence.
    static func longestIncreasingSubsequence(_ values: [Int]) -> [Int] {
        guard !values.isEmpty else { return [] }
        var tails: [Int] = []      // indices into values
        var prev = [Int](repeating: -1, count: values.count)
        for (i, v) in values.enumerated() {
            var lo = 0, hi = tails.count
            while lo < hi {
                let mid = (lo + hi) / 2
                if values[tails[mid]] < v { lo = mid + 1 } else { hi = mid }
            }
            if lo > 0 { prev[i] = tails[lo - 1] }
            if lo == tails.count { tails.append(i) } else { tails[lo] = i }
        }
        var result: [Int] = []
        var k = tails.last ?? -1
        while k >= 0 { result.append(k); k = prev[k] }
        return result.reversed()
    }
}
