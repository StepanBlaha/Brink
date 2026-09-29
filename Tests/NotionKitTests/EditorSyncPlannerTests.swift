import Testing
import Foundation
@testable import NotionKit

private func s(_ id: String, _ content: String, _ kind: ParagraphKind = .paragraph, parent: String? = nil, hidden: Bool = false) -> SyncedParagraph {
    SyncedParagraph(blockID: id, parentID: parent, kind: kind, content: content, hasHiddenChildren: hidden)
}

private func d(_ id: String?, _ content: String, _ kind: ParagraphKind = .paragraph, depth: Int = 0, local: String? = nil) -> DocParagraph {
    DocParagraph(localID: local ?? (id.map { "L-\($0)" } ?? UUID().uuidString), blockID: id, kind: kind, content: content, depth: depth)
}

/// Previous state mirrored exactly as the current document (what a fresh load gives).
private func unchanged(_ previous: [SyncedParagraph]) -> [DocParagraph] {
    var depth: [String: Int] = [:]
    return previous.map { p in
        let level = p.parentID.flatMap { depth[$0].map { $0 + 1 } } ?? 0
        depth[p.blockID] = level
        return d(p.blockID, p.content, p.kind, depth: level)
    }
}

@Suite("EditorSyncPlanner — exact identity ops")
struct EditorSyncPlannerTests {
    let base = [s("a", "Alpha"), s("b", "Hello world"), s("c", "Gamma")]

    @Test("no changes → no ops")
    func noChanges() {
        #expect(EditorSyncPlanner.plan(previous: base, current: unchanged(base)).isEmpty)
    }

    @Test("editing one character in the middle → a single update")
    func singleCharEdit() {
        var current = unchanged(base)
        current[1].content = "Hello, world"
        #expect(EditorSyncPlanner.plan(previous: base, current: current) == [
            .update(blockID: "b", kind: .paragraph, content: "Hello, world"),
        ])
    }

    @Test("Enter at the end of a line → one insert after that block")
    func enterAtEnd() {
        var current = unchanged(base)
        let new = d(nil, "", local: "n1")
        current.insert(new, at: 2)
        #expect(EditorSyncPlanner.plan(previous: base, current: current) == [
            .insert(parent: .page, position: .after(blockID: "b"), paragraphs: [new]),
        ])
    }

    @Test("Enter mid-line → update of the first half + insert of the second half after it")
    func enterMidLine() {
        var current = unchanged(base)
        current[1].content = "Hello"
        let second = d(nil, " world", local: "n1")
        current.insert(second, at: 2)
        #expect(EditorSyncPlanner.plan(previous: base, current: current) == [
            .update(blockID: "b", kind: .paragraph, content: "Hello"),
            .insert(parent: .page, position: .after(blockID: "b"), paragraphs: [second]),
        ])
    }

    @Test("an empty line is an empty paragraph block: inserted, and kept when unchanged")
    func emptyLine() {
        var current = unchanged(base)
        let empty = d(nil, "", local: "e1")
        current.insert(empty, at: 1)
        #expect(EditorSyncPlanner.plan(previous: base, current: current) == [
            .insert(parent: .page, position: .after(blockID: "a"), paragraphs: [empty]),
        ])

        // Server state with empty paragraphs round-trips with no ops (nothing gets dropped).
        let withEmpties = [s("a", "A"), s("e1", ""), s("e2", ""), s("b", "B"), s("e3", "")]
        #expect(EditorSyncPlanner.plan(previous: withEmpties, current: unchanged(withEmpties)).isEmpty)
    }

    @Test("deleting a line → one delete")
    func deleteLine() {
        var current = unchanged(base)
        current.remove(at: 1)
        #expect(EditorSyncPlanner.plan(previous: base, current: current) == [.delete(blockID: "b")])
    }

    @Test("merging two lines (Backspace at line start) → update + delete")
    func mergeLines() {
        var current = unchanged(base)
        current[1].content = "Hello worldGamma"
        current.remove(at: 2)
        #expect(EditorSyncPlanner.plan(previous: base, current: current) == [
            .update(blockID: "b", kind: .paragraph, content: "Hello worldGamma"),
            .delete(blockID: "c"),
        ])
    }

    @Test("pasting 3 lines → one batched insert at the right position")
    func pasteThreeLines() {
        var current = unchanged(base)
        let pasted = [d(nil, "one", local: "p1"), d(nil, "two", .bulleted, local: "p2"), d(nil, "three", local: "p3")]
        current.insert(contentsOf: pasted, at: 1)
        #expect(EditorSyncPlanner.plan(previous: base, current: current) == [
            .insert(parent: .page, position: .after(blockID: "a"), paragraphs: pasted),
        ])
    }

    @Test("inserts at the very top use position start; > 100 new blocks are split into batches")
    func startAndBatchLimit() {
        let prev = [s("a", "A")]
        let new = (0..<150).map { d(nil, "line \($0)", local: "n\($0)") }
        let ops = EditorSyncPlanner.plan(previous: prev, current: new + unchanged(prev))
        #expect(ops.count == 2)
        #expect(ops[0] == .insert(parent: .page, position: .start, paragraphs: Array(new[0..<100])))
        #expect(ops[1] == .insert(parent: .page, position: .afterPending(localID: "n99"), paragraphs: Array(new[100..<150])))
    }

    @Test("kind change Notion can't do in place (\"foo\" → \"# foo\") → insert new + delete old")
    func kindChange() {
        let prev = [s("a", "foo")]
        let current = [d("a", "foo", .heading1, local: "La")]
        #expect(EditorSyncPlanner.plan(previous: prev, current: current) == [
            .insert(parent: .page, position: .start, paragraphs: current),
            .delete(blockID: "a"),
        ])
    }

    @Test("checking a to-do / changing code language are in-place updates")
    func inPlaceKindChanges() {
        let prev = [s("t", "task", .toDo(checked: false)), s("k", "let x = 1", .code(language: "plain text"))]
        let current = [d("t", "task", .toDo(checked: true)), d("k", "let x = 1", .code(language: "swift"))]
        #expect(EditorSyncPlanner.plan(previous: prev, current: current) == [
            .update(blockID: "t", kind: .toDo(checked: true), content: "task"),
            .update(blockID: "k", kind: .code(language: "swift"), content: "let x = 1"),
        ])
    }

    @Test("indenting a line → recreated as a child of the paragraph above (insert + delete)")
    func indent() {
        let prev = [s("a", "one", .bulleted), s("b", "two", .bulleted)]
        let current = [d("a", "one", .bulleted), d("b", "two", .bulleted, depth: 1, local: "Lb")]
        #expect(EditorSyncPlanner.plan(previous: prev, current: current) == [
            .insert(parent: .block("a"), position: .start, paragraphs: [current[1]]),
            .delete(blockID: "b"),
        ])
    }

    @Test("outdenting a child → recreated at the parent's level after it")
    func outdent() {
        let prev = [s("a", "one", .bulleted), s("b", "two", .bulleted, parent: "a"), s("c", "three")]
        let current = [d("a", "one", .bulleted), d("b", "two", .bulleted, local: "Lb"), d("c", "three")]
        #expect(EditorSyncPlanner.plan(previous: prev, current: current) == [
            .insert(parent: .page, position: .after(blockID: "a"), paragraphs: [current[1]]),
            .delete(blockID: "b"),
        ])
    }

    @Test("a recreated parent takes its children along; only the top-most old block is deleted")
    func cascade() {
        let prev = [s("a", "one"), s("b", "child", .bulleted, parent: "a")]
        let current = [d("a", "one", .quote, local: "La"), d("b", "child", .bulleted, depth: 1, local: "Lb")]
        #expect(EditorSyncPlanner.plan(previous: prev, current: current) == [
            .insert(parent: .page, position: .start, paragraphs: [current[0]]),
            .insert(parent: .pending(localID: "La"), position: .start, paragraphs: [current[1]]),
            .delete(blockID: "a"),
        ])
    }

    @Test("a deleted token paragraph → no delete op, the token is restored in place")
    func tokenDeleted() {
        let token = s("db", "", .token(type: "child_database", title: "Tasks"))
        let prev = [s("a", "A"), token, s("b", "B")]
        let current = [d("a", "A"), d("b", "B")]
        #expect(EditorSyncPlanner.plan(previous: prev, current: current) == [
            .restoreToken(token, depth: 0, afterBlockID: "a"),
        ])
    }

    @Test("a token that's still present is left alone, as are its neighbors")
    func tokenKept() {
        let prev = [s("a", "A"), s("db", "", .token(type: "child_database", title: "Tasks")), s("b", "B")]
        #expect(EditorSyncPlanner.plan(previous: prev, current: unchanged(prev)).isEmpty)
    }

    @Test("an id the server doesn't know (e.g. deleted remotely) is inserted as new")
    func unknownID() {
        let prev = [s("a", "A")]
        let current = [d("a", "A"), d("zombie", "back", local: "Lz")]
        #expect(EditorSyncPlanner.plan(previous: prev, current: current) == [
            .insert(parent: .page, position: .after(blockID: "a"), paragraphs: [current[1]]),
        ])
    }

    @Test("a line moved (cut + paste) above others → only the moved block is recreated")
    func moved() {
        let prev = [s("a", "A"), s("b", "B"), s("c", "C"), s("d", "D")]
        let current = [d("d", "D", local: "Ld"), d("a", "A"), d("b", "B"), d("c", "C")]
        #expect(EditorSyncPlanner.plan(previous: prev, current: current) == [
            .insert(parent: .page, position: .start, paragraphs: [current[0]]),
            .delete(blockID: "d"),
        ])
    }

    @Test("blocks with hidden children are never recreated")
    func hiddenChildren() {
        let prev = [s("a", "deep", .bulleted, hidden: true)]
        let current = [d("a", "deep", .heading1)]
        #expect(EditorSyncPlanner.plan(previous: prev, current: current).isEmpty)
    }
}
