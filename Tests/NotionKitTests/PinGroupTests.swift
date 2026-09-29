import Testing
import Foundation
@testable import NotionKit

@Suite("Pin groups")
struct PinGroupTests {
    private func tempURL() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".json")
    }

    private func makeStore(pins: [Pin] = []) async throws -> (PinStore, URL, URL) {
        let pinsURL = tempURL()
        let groupsURL = tempURL()
        if !pins.isEmpty {
            let data = try JSONEncoder().encode(pins)
            try data.write(to: pinsURL)
        }
        let store = await MainActor.run { PinStore(fileURL: pinsURL, groupsFileURL: groupsURL) }
        return (store, pinsURL, groupsURL)
    }

    @Test("pins.json with no groupId key decodes with groupId == nil")
    func legacyPinsDecodeWithoutGroupId() async throws {
        // Same trick as PinCustomIconTests: encode a real Pin (whose groupId is nil, so
        // JSONEncoder omits the key) to get exactly what an old app version would have written.
        let pin = Pin(id: "pin-1", notionId: "notion-1", kind: .page, title: "Tasks", icon: .emoji("📝"), order: 0)
        let data = try JSONEncoder().encode(pin)
        let json = String(data: data, encoding: .utf8) ?? ""
        #expect(!json.contains("groupId"), "sanity check: this Pin encoding must look like a pre-groups file")

        let (store, _, _) = try await makeStore(pins: [pin])
        let pins = await MainActor.run { store.pins }
        let decoded = try #require(pins.first)
        #expect(decoded.groupId == nil)
        #expect(decoded.title == "Tasks")
    }

    @Test("move(pinID:toIndex:withinGroup:) reorders only within that group")
    func moveReordersWithinGroup() async throws {
        let groupA = "group-a"
        let pins = [
            Pin(id: "a1", notionId: "n-a1", kind: .page, title: "A1", icon: .none, order: 0, groupId: groupA),
            Pin(id: "a2", notionId: "n-a2", kind: .page, title: "A2", icon: .none, order: 1, groupId: groupA),
            Pin(id: "a3", notionId: "n-a3", kind: .page, title: "A3", icon: .none, order: 2, groupId: groupA),
            Pin(id: "b1", notionId: "n-b1", kind: .page, title: "B1", icon: .none, order: 3, groupId: nil),
        ]
        let (store, _, _) = try await makeStore(pins: pins)

        await MainActor.run { store.move(pinID: "a3", toIndex: 0, withinGroup: groupA) }

        let result = await MainActor.run { store.pins }
        let groupAOrdered = result.filter { $0.groupId == groupA }.sorted { $0.order < $1.order }.map(\.id)
        #expect(groupAOrdered == ["a3", "a1", "a2"])

        // The ungrouped pin (different group) must be untouched.
        let ungrouped = try #require(result.first { $0.id == "b1" })
        #expect(ungrouped.order == 3)
    }

    @Test("deleting a group ungroups its pins instead of deleting them")
    func deleteGroupUngroupsPins() async throws {
        let (store, _, _) = try await makeStore()
        let group = await MainActor.run { store.addGroup(name: "Work", emoji: "💼") }
        let pin = Pin(notionId: "n-1", kind: .page, title: "Tasks", icon: .none, order: 0, groupId: group.id)
        await MainActor.run { store.add(pin) }

        await MainActor.run { store.deleteGroup(id: group.id) }

        let groups = await MainActor.run { store.groups }
        #expect(groups.isEmpty)

        let pins = await MainActor.run { store.pins }
        let survivor = try #require(pins.first { $0.notionId == "n-1" })
        #expect(survivor.groupId == nil, "pin must survive, only ungrouped")
    }

    @Test("setGroup moves a pin into a group, appended after its current pins")
    func setGroupAppendsToGroup() async throws {
        let groupA = "group-a"
        let pins = [
            Pin(id: "a1", notionId: "n-a1", kind: .page, title: "A1", icon: .none, order: 0, groupId: groupA),
            Pin(id: "loose", notionId: "n-loose", kind: .page, title: "Loose", icon: .none, order: 1, groupId: nil),
        ]
        let (store, _, _) = try await makeStore(pins: pins)

        await MainActor.run { store.setGroup(pinID: "loose", groupID: groupA) }

        let result = await MainActor.run { store.pins }
        let moved = try #require(result.first { $0.id == "loose" })
        #expect(moved.groupId == groupA)
        #expect(moved.order == 1, "appended after a1's order (0)")
    }

    @Test("groups.json round-trips and reorders via moveGroup")
    func groupsPersistAndReorder() async throws {
        let (store, _, groupsURL) = try await makeStore()
        await MainActor.run {
            store.addGroup(name: "Work", emoji: "💼")
            store.addGroup(name: "Home", emoji: "🏠")
        }

        let onDisk = try JSONDecoder().decode([PinGroup].self, from: Data(contentsOf: groupsURL))
        #expect(onDisk.map(\.name) == ["Work", "Home"])

        await MainActor.run { store.moveGroup(fromOffsets: IndexSet(integer: 1), toOffset: 0) }
        let reordered = await MainActor.run { store.groups }
        #expect(reordered.map(\.name) == ["Home", "Work"])
    }
}
