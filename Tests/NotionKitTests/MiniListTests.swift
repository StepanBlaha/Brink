import XCTest
@testable import NotionKit

final class MiniListTests: XCTestCase {
    private func pin(_ id: String, order: Int, group: String? = nil) -> Pin {
        Pin(id: id, notionId: id, kind: .page, title: id, icon: .none, order: order, groupId: group)
    }
    private func summary(_ open: Int) -> PinSummary {
        PinSummary(openCount: open, doneCount: 0, total: open, dueTodayCount: 0, nextItems: [])
    }

    func testSortsByOrderAndCounts() {
        let s = MiniList.sections(pins: [pin("b", order: 2), pin("a", order: 1)], summaries: ["a": summary(3)], groups: [], activeGroupID: nil)
        XCTAssertEqual(s.map(\.pinID), ["a", "b"])
        XCTAssertEqual(s.map(\.openCount), [3, 0])
    }

    func testActiveGroupFilter() {
        let g = PinGroup(id: "g", name: "G", emoji: nil, order: 0)
        let pins = [pin("a", order: 0, group: "g"), pin("b", order: 1)]
        XCTAssertEqual(MiniList.sections(pins: pins, summaries: [:], groups: [g], activeGroupID: "g").map(\.pinID), ["a"])
        XCTAssertEqual(MiniList.sections(pins: pins, summaries: [:], groups: [g], activeGroupID: "gone").count, 2)
    }

    func testTotalsAndTitle() {
        XCTAssertEqual(MiniList.totalOpen(pins: [pin("a", order: 0), pin("b", order: 1)], summaries: ["a": summary(2), "b": summary(5)]), 7)
        XCTAssertEqual(MiniList.statusTitle(totalOpen: 7, showCount: true), " 7")
        XCTAssertEqual(MiniList.statusTitle(totalOpen: 0, showCount: true), "")
        XCTAssertEqual(MiniList.statusTitle(totalOpen: 7, showCount: false), "")
        XCTAssertEqual(MiniList.statusTitle(totalOpen: 250, showCount: true), " 99+")
    }

    func testTickThrottle() {
        var t = TickThrottle(minInterval: 0.08)
        let t0 = Date(timeIntervalSince1970: 1000)
        XCTAssertTrue(t.allow(now: t0))
        XCTAssertFalse(t.allow(now: t0.addingTimeInterval(0.05)))
        XCTAssertTrue(t.allow(now: t0.addingTimeInterval(0.09)))
        XCTAssertFalse(t.allow(now: t0.addingTimeInterval(0.1)))
    }
}
