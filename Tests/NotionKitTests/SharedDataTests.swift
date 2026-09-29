import Testing
import Foundation
@testable import NotionKit

@Suite("Shared widget/share data")
struct SharedDataTests {
    private func tempInbox() -> SharedInbox {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("brink-inbox-\(UUID().uuidString)")
        return SharedInbox(url: dir.appendingPathComponent("inbox.jsonl"))
    }

    private let page = Pin(id: "p1", notionId: "page-1", kind: .page, title: "Inbox", icon: .emoji("📥"), order: 0)
    private let db = Pin(id: "p2", notionId: "ds-1", kind: .dataSource, title: "Buylist", icon: .none, order: 1,
                         config: DatabaseConfig(doneProperty: "Done", doneKind: .checkbox, dateProperty: "Due"))

    @Test("inbox line encode/decode round trip, malformed lines skipped")
    func lineCodec() throws {
        let a = InboxEntry(action: .toggle(pinId: "p1", itemId: "b1", kind: .page, checked: true))
        let b = InboxEntry(action: .capture(text: "Read later", url: "https://example.com", pinId: nil))
        var data = try SharedInbox.encodeLine(a)
        data.append(Data("not json\n".utf8))
        data.append(try SharedInbox.encodeLine(b))
        let decoded = SharedInbox.decodeLines(data)
        #expect(decoded.map(\.id) == [a.id, b.id])
        #expect(decoded[0].action == a.action)
        #expect(decoded[1].action == b.action)
    }

    @Test("append then drain removes only handled entries")
    func appendDrain() throws {
        let inbox = tempInbox()
        #expect(inbox.readAll().isEmpty)
        let first = try inbox.append(.capture(text: "one", url: nil, pinId: "p1"))
        let second = try inbox.append(.toggle(pinId: "p2", itemId: "r1", kind: .db, checked: true))
        #expect(inbox.readAll().map(\.id) == [first.id, second.id])
        var seen: [String] = []
        try inbox.drain { entries in
            seen = entries.map(\.id)
            return [first.id]
        }
        #expect(seen == [first.id, second.id])
        #expect(inbox.readAll().map(\.id) == [second.id])
        try inbox.remove(ids: [second.id])
        #expect(inbox.readAll().isEmpty)
    }

    @Test("snapshot JSON round trip and optimistic check")
    func snapshotRoundTrip() throws {
        var summary = PinSummary(openCount: 2, doneCount: 0, total: 2, dueTodayCount: 1, nextItems: ["A", "B"])
        summary.nextRefs = [.init(id: "b1", title: "A"), .init(id: "b2", title: "B")]
        var snap = WidgetSnapshot.build(pins: [db, page], summaries: ["p1": summary], activeGroupID: nil,
                                        now: Date(timeIntervalSince1970: 1_800_000_000))
        #expect(snap.pins.map(\.id) == ["p1", "p2"])
        #expect(snap.pins[0].icon == "📥")
        #expect(snap.pins[1].icon == "B")
        #expect(snap.pins[0].next.map(\.id) == ["b1", "b2"])
        #expect(snap.pins[0].next[0].pinId == "p1")
        let decoded = try WidgetSnapshot.decode(try snap.encoded())
        #expect(decoded == snap)

        snap.setChecked(pinID: "p1", itemID: "b1", checked: true)
        #expect(snap.pins[0].next[0].checked)
        #expect(snap.pins[0].openCount == 1)
        snap.setChecked(pinID: "p1", itemID: "b1", checked: true)
        #expect(snap.pins[0].openCount == 1)
    }

    @Test("capture action maps to the quick-capture plan")
    func captureMapping() throws {
        let pagePlan = try #require(InboxCapture.plan(text: "Article", url: "https://example.com/a", pinId: "p1", pins: [page, db], fallbackID: nil))
        #expect(pagePlan.pin.id == "p1")
        let expected = CaptureRequest.plan(text: "[Article](https://example.com/a)", pin: page, dateProperty: nil)
        #expect(pagePlan.plan == expected)
        guard case .appendBlock(let parent, _) = pagePlan.plan.operation else { Issue.record("expected appendBlock"); return }
        #expect(parent == "page-1")

        let dbPlan = try #require(InboxCapture.plan(text: "Milk", url: nil, pinId: nil, pins: [page, db], fallbackID: "p2"))
        #expect(dbPlan.pin.id == "p2")
        guard case .createRow(let ds, let title, _) = dbPlan.plan.operation else { Issue.record("expected createRow"); return }
        #expect(ds == "ds-1")
        #expect(title == "Milk")

        #expect(InboxCapture.captureText(text: "", url: "https://x.y", kind: .page) == "https://x.y")
        #expect(InboxCapture.captureText(text: "see https://x.y", url: "https://x.y", kind: .page) == "see https://x.y")
        #expect(InboxCapture.plan(text: "  ", url: nil, pinId: nil, pins: [page], fallbackID: nil) == nil)
        #expect(InboxCapture.destination(pinId: "gone", pins: [db, page], fallbackID: nil)?.id == "p1")
    }

    @Test("toggle action maps to menu-bar tick writes")
    func toggleMapping() {
        #expect(InboxCapture.toggleOperation(pin: page, itemId: "b1", checked: true) == .updateBlock(blockId: "b1", type: "to_do", update: .checked(true)))
        #expect(InboxCapture.toggleOperation(pin: db, itemId: "r1", checked: false) == .toggleDone(pageId: "r1", update: PropertyUpdate(name: "Done", value: .checkbox(false))))
    }

    @Test("pin URL scheme round trip")
    func pinURL() throws {
        let url = try #require(SharedContainer.pinURL("abc-123"))
        #expect(url.absoluteString == "brink://pin/abc-123")
        #expect(SharedContainer.pinID(from: url) == "abc-123")
        #expect(SharedContainer.pinID(from: URL(string: "https://pin/abc")!) == nil)
    }
}
