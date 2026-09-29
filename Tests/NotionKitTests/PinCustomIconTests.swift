import Testing
import Foundation
@testable import NotionKit

@Suite("Pin custom icon")
struct PinCustomIconTests {
    /// Builds JSON shaped like a pre-`customIcon` pins.json: encodes a real `Pin` (whose
    /// `customIcon` is `nil`), which — since `JSONEncoder` omits `nil` `Optional` properties —
    /// produces exactly the same bytes an old app version would have written, without hardcoding
    /// `PinIcon`'s (Swift-synthesized, non-Notion-shaped) wire format.
    private func legacyPinData(id: String, title: String, order: Int) throws -> Data {
        let pin = Pin(id: id, notionId: "notion-\(id)", kind: .page, title: title, icon: .emoji("📝"), order: order)
        let data = try JSONEncoder().encode(pin)
        let json = String(data: data, encoding: .utf8) ?? ""
        #expect(!json.contains("customIcon"), "sanity check: this Pin encoding must look like an old file")
        return data
    }

    @Test("PinStore decodes an old pins.json (no customIcon field) with customIcon == nil")
    func decodesOldPinsFileWithoutCustomIcon() async throws {
        let legacyPin = try legacyPinData(id: "pin-1", title: "Tasks", order: 0)
        let arrayData = Data(("[" + String(data: legacyPin, encoding: .utf8)! + "]").utf8)

        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".json")
        try arrayData.write(to: tempURL)
        defer { try? FileManager.default.removeItem(at: tempURL) }

        let store = await MainActor.run { PinStore(fileURL: tempURL) }
        let pins = await MainActor.run { store.pins }
        let pin = try #require(pins.first)
        #expect(pin.id == "pin-1")
        #expect(pin.title == "Tasks")
        #expect(pin.customIcon == nil)
    }

    @Test("Pin itself decodes legacy JSON (no customIcon key) with customIcon defaulting to nil")
    func pinDecodesLegacyJSONDirectly() throws {
        let legacyData = try legacyPinData(id: "pin-2", title: "Backlog", order: 1)
        let pin = try JSONDecoder().decode(Pin.self, from: legacyData)
        #expect(pin.customIcon == nil)
        #expect(pin.title == "Backlog")
    }

    @Test("CustomIcon round-trips through Codable for every case")
    func customIconCodableRoundTrip() throws {
        let cases: [CustomIcon] = [
            .emoji("🔥"),
            .sfSymbol(name: "star.fill", colorHex: 0x0A84FF),
            .letter(text: "AB", colorHex: 0xFF453A),
        ]
        for original in cases {
            let data = try JSONEncoder().encode(original)
            let decoded = try JSONDecoder().decode(CustomIcon.self, from: data)
            #expect(decoded == original)
        }
    }

    @Test("Pin with a customIcon round-trips through Codable")
    func pinWithCustomIconRoundTrip() throws {
        let pin = Pin(
            notionId: "notion-3",
            kind: .page,
            title: "Reading list",
            icon: .emoji("📚"),
            order: 2,
            customIcon: .letter(text: "R", colorHex: 0x32D74B)
        )
        let data = try JSONEncoder().encode(pin)
        let decoded = try JSONDecoder().decode(Pin.self, from: data)
        #expect(decoded == pin)
        #expect(decoded.customIcon == .letter(text: "R", colorHex: 0x32D74B))
    }
}
