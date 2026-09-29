import Testing
import Foundation
@testable import NotionKit

@Suite("Pin summary")
struct PinSummaryTests {
    private func todo(_ id: String, _ text: String, checked: Bool) -> Block {
        Block(id: id, type: .toDo(checked: checked), hasChildren: false, plainText: text)
    }

    private func row(_ id: String, _ title: String, done: Bool, due: String? = nil) -> Row {
        var props: [String: PropertyValue] = ["Name": .title(title), "Done": .checkbox(done)]
        if let due { props["Due"] = .date(start: due, end: nil) }
        return Row(id: id, url: nil, icon: .none, title: title, properties: props)
    }

    @Test("blocks: only to-dos count, next items are the first three open titles")
    func blocks() {
        let blocks = [
            Block(id: "p", type: .paragraph, hasChildren: false, plainText: "hello"),
            todo("1", "a", checked: false), todo("2", "b", checked: true),
            todo("3", "c", checked: false), todo("4", "d", checked: false), todo("5", "e", checked: false),
        ]
        let s = PinSummary.fromBlocks(blocks)
        #expect(s.total == 5)
        #expect(s.doneCount == 1)
        #expect(s.openCount == 4)
        #expect(s.dueTodayCount == 0)
        #expect(s.nextItems == ["a", "c", "d"])
    }

    @Test("rows with checkbox config: done, open, due today")
    func rowsCheckbox() {
        let config = DatabaseConfig(doneProperty: "Done", doneKind: .checkbox, dateProperty: "Due")
        let rows = [
            row("1", "x", done: false, due: "2026-09-29"),
            row("2", "y", done: false, due: "2026-09-29T10:00:00.000+02:00"),
            row("3", "z", done: true, due: "2026-09-29"),
            row("4", "w", done: false, due: "2026-09-30"),
            row("5", "", done: false),
        ]
        let s = PinSummary.fromRows(rows, config: config, today: "2026-09-29")
        #expect(s.total == 5)
        #expect(s.doneCount == 1)
        #expect(s.openCount == 4)
        #expect(s.dueTodayCount == 2)
        #expect(s.nextItems == ["x", "y", "w"])
    }

    @Test("rows with status config")
    func rowsStatus() {
        let config = DatabaseConfig(doneProperty: "Status", doneKind: .status, doneValue: "Done", dateProperty: nil)
        let rows = [
            Row(id: "1", url: nil, icon: .none, title: "a", properties: ["Status": .status(name: "Done")]),
            Row(id: "2", url: nil, icon: .none, title: "b", properties: ["Status": .status(name: "To do")]),
            Row(id: "3", url: nil, icon: .none, title: "c", properties: ["Status": .status(name: nil)]),
        ]
        let s = PinSummary.fromRows(rows, config: config, today: "2026-09-29")
        #expect(s.doneCount == 1 && s.openCount == 2 && s.total == 3 && s.dueTodayCount == 0)
    }

    @Test("progress ratio")
    func ratio() {
        let a = PinSummary(openCount: 1, doneCount: 1, total: 2, dueTodayCount: 0, nextItems: [])
        let b = PinSummary(openCount: 0, doneCount: 2, total: 2, dueTodayCount: 0, nextItems: [])
        #expect(PinSummary.progressRatio([a, b]) == 0.75)
        #expect(PinSummary.progressRatio([.empty]) == nil)
    }
}

@Suite("Hotkey combos")
struct HotkeyComboTests {
    @Test("encode/decode round-trips and rejects junk")
    func roundTrip() {
        let combo = HotkeyCombo(keyCode: 49, modifiers: HotkeyCombo.option | HotkeyCombo.shift)
        #expect(HotkeyCombo(encoded: combo.encoded) == combo)
        #expect(HotkeyCombo(encoded: "nope") == nil)
        #expect(HotkeyCombo(encoded: "1:2:3") == nil)
        #expect(combo.modifierSymbols == "⌥⇧")
    }

    @Test("defaults don't conflict; conflicts are detected")
    func conflicts() {
        let d = HotkeyBindings.defaults
        for a in HotkeyAction.allCases {
            #expect(d.conflict(for: a, combo: d.combo(for: a)) == nil)
        }
        let clash = HotkeyCombo(keyCode: 49, modifiers: HotkeyCombo.option)
        #expect(d.conflict(for: .quickCapture, combo: clash) == .toggleLastPin)
        // ⌥+any key overlapping ⌥1…⌥9
        let digit = HotkeyCombo(keyCode: HotkeyAction.digitKeyCodes[2], modifiers: HotkeyCombo.option)
        #expect(d.conflict(for: .clipboardAppend, combo: digit) == .openPinN)
        #expect(HotkeyAction.pinIndex(forKeyCode: HotkeyAction.digitKeyCodes[4]) == 4)
    }
}
