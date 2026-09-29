import Testing
import AppKit
@testable import NotionKit

@MainActor
@Suite("Moving blocks — planner recreate, ⌥⇧↑/↓ commands, drop depth")
struct MoveBlockTests {
    private func doc(_ id: String, _ content: String, depth: Int = 0) -> DocParagraph {
        DocParagraph(localID: "L-\(id)", blockID: id, kind: .paragraph, content: content, depth: depth)
    }

    @Test("a moved block with children is recreated after its new previous sibling, then the old one deleted")
    func plannerRecreatesMovedBlock() {
        let previous = [
            SyncedParagraph(blockID: "a", kind: .paragraph, content: "A"),
            SyncedParagraph(blockID: "a1", parentID: "a", kind: .paragraph, content: "A1"),
            SyncedParagraph(blockID: "a2", parentID: "a", kind: .paragraph, content: "A2"),
            SyncedParagraph(blockID: "b", kind: .paragraph, content: "B"),
            SyncedParagraph(blockID: "c", kind: .paragraph, content: "C"),
            SyncedParagraph(blockID: "d", kind: .paragraph, content: "D"),
        ]
        let current = [doc("b", "B"), doc("c", "C"), doc("a", "A"), doc("a1", "A1", depth: 1), doc("a2", "A2", depth: 1), doc("d", "D")]
        let ops = EditorSyncPlanner.plan(previous: previous, current: current)
        #expect(ops == [
            .insert(parent: .page, position: .after(blockID: "c"), paragraphs: [current[2]]),
            .insert(parent: .pending(localID: "L-a"), position: .start, paragraphs: [current[3], current[4]]),
            .delete(blockID: "a"),
        ])
    }

    @Test("swapping two siblings recreates the one without children")
    func plannerPrefersCheapRecreate() {
        let previous = [
            SyncedParagraph(blockID: "a", kind: .paragraph, content: "A"),
            SyncedParagraph(blockID: "a1", parentID: "a", kind: .paragraph, content: "A1"),
            SyncedParagraph(blockID: "b", kind: .paragraph, content: "B"),
        ]
        let current = [doc("b", "B"), doc("a", "A"), doc("a1", "A1", depth: 1)]
        #expect(EditorSyncPlanner.plan(previous: previous, current: current) == [
            .insert(parent: .page, position: .start, paragraphs: [current[0]]),
            .delete(blockID: "b"),
        ])
    }

    private func host() -> TestEditorHost {
        TestEditorHost([
            SyncedParagraph(blockID: "a", kind: .bulleted, content: "Alpha"),
            SyncedParagraph(blockID: "a1", parentID: "a", kind: .paragraph, content: "child"),
            SyncedParagraph(blockID: "b", kind: .toDo(checked: true), content: "Beta"),
        ])
    }

    private func order(_ h: TestEditorHost) -> [String] {
        h.document.paragraphs().map { "\($0.blockID ?? "-")@\($0.depth)" }
    }

    @Test("⌥⇧↓ moves the block with its children below the next one; ⌘Z restores; ⌥⇧↑ moves it back up")
    func keyboardMove() {
        let h = host()
        h.caret(at: 2)
        #expect(h.commands.moveBlockDown())
        #expect(order(h) == ["b@0", "a@0", "a1@1"])
        #expect(h.text == "Beta\nAlpha\nchild")
        #expect(h.kinds == [.toDo(checked: true), .bulleted, .paragraph])
        #expect(h.selection.location == 5 + 2) // caret stays on "Alpha", same offset
        #expect(!h.commands.moveBlockDown()) // already last

        h.undo.undo()
        #expect(order(h) == ["a@0", "a1@1", "b@0"])
        #expect(h.text == "Alpha\nchild\nBeta")

        h.caret(at: (h.text as NSString).range(of: "Beta").location)
        #expect(h.commands.moveBlockUp())
        #expect(order(h) == ["b@0", "a@0", "a1@1"])
        #expect(!h.commands.moveBlockUp()) // already first
    }

    @Test("dropping at a deeper x nests the block (depth clamped to one below the line above)")
    func dropIntoNesting() {
        let h = host()
        let beta = (h.text as NSString).range(of: "Beta").location
        #expect(h.commands.maxDepth(forMoveOf: beta, before: 1) == 1)
        #expect(h.commands.moveBlock(at: beta, before: 1, depth: 3))
        #expect(order(h) == ["a@0", "b@1", "a1@1"])
        // Planner: b changed parent → recreated under a (first child), old b deleted.
        let previous = [
            SyncedParagraph(blockID: "a", kind: .bulleted, content: "Alpha"),
            SyncedParagraph(blockID: "a1", parentID: "a", kind: .paragraph, content: "child"),
            SyncedParagraph(blockID: "b", kind: .toDo(checked: true), content: "Beta"),
        ]
        let ops = EditorSyncPlanner.plan(previous: previous, current: h.document.paragraphs())
        #expect(ops.count == 2)
        if case .insert(let parent, let position, let paragraphs) = ops.first {
            #expect(parent == .block("a"))
            #expect(position == .start)
            #expect(paragraphs.map(\.content) == ["Beta"])
        } else {
            Issue.record("expected an insert, got \(ops)")
        }
        #expect(ops.last == .delete(blockID: "b"))

        // …and out again: to the top level at the end.
        let moved = (h.text as NSString).range(of: "Beta").location
        #expect(h.commands.moveBlock(at: moved, before: 3, depth: 0))
        #expect(order(h) == ["a@0", "a1@1", "b@0"])
    }

    @Test("a block can't be dropped into its own children")
    func noDropIntoSelf() {
        let h = host()
        #expect(!h.commands.moveBlock(at: 0, before: 1, depth: 0))
        #expect(!h.commands.moveBlock(at: 0, before: 2, depth: 0))
        #expect(order(h) == ["a@0", "a1@1", "b@0"])
    }
}
