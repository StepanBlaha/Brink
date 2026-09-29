import Foundation

/// What the main app publishes for the widget and the Share extension to read.
public struct WidgetSnapshot: Codable, Equatable, Sendable {
    public enum ItemKind: String, Codable, Sendable { case page, db }

    public struct Item: Codable, Equatable, Sendable, Identifiable {
        public var id: String
        public var pinId: String
        public var title: String
        public var checked: Bool
        public var kind: ItemKind

        public init(id: String, pinId: String, title: String, checked: Bool = false, kind: ItemKind) {
            self.id = id
            self.pinId = pinId
            self.title = title
            self.checked = checked
            self.kind = kind
        }
    }

    public struct PinEntry: Codable, Equatable, Sendable, Identifiable {
        public var id: String
        public var title: String
        /// An emoji, or one or two letters when the pin has no emoji.
        public var icon: String
        public var openCount: Int
        public var dueToday: Int
        public var groupId: String?
        public var kind: ItemKind
        public var next: [Item]

        public init(id: String, title: String, icon: String, openCount: Int, dueToday: Int, groupId: String? = nil, kind: ItemKind, next: [Item]) {
            self.id = id
            self.title = title
            self.icon = icon
            self.openCount = openCount
            self.dueToday = dueToday
            self.groupId = groupId
            self.kind = kind
            self.next = next
        }
    }

    public var generatedAt: Date
    public var activeGroupID: String?
    public var pins: [PinEntry]

    public init(generatedAt: Date = Date(), activeGroupID: String? = nil, pins: [PinEntry]) {
        self.generatedAt = generatedAt
        self.activeGroupID = activeGroupID
        self.pins = pins
    }

    public static let empty = WidgetSnapshot(generatedAt: .distantPast, pins: [])

    /// Pins in the active group, or all pins when no (existing) group is active.
    public var activePins: [PinEntry] {
        guard let activeGroupID, pins.contains(where: { $0.groupId == activeGroupID }) else { return pins }
        return pins.filter { $0.groupId == activeGroupID }
    }

    /// Optimistically flips one item (widget tap before the app has synced).
    public mutating func setChecked(pinID: String, itemID: String, checked: Bool) {
        guard let p = pins.firstIndex(where: { $0.id == pinID }),
              let i = pins[p].next.firstIndex(where: { $0.id == itemID }) else { return }
        guard pins[p].next[i].checked != checked else { return }
        pins[p].next[i].checked = checked
        pins[p].openCount = max(0, pins[p].openCount + (checked ? -1 : 1))
    }

    // MARK: - Persistence

    public func encoded() throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(self)
    }

    public static func decode(_ data: Data) throws -> WidgetSnapshot {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(WidgetSnapshot.self, from: data)
    }

    public static func load(from url: URL? = SharedContainer.snapshotURL) -> WidgetSnapshot {
        guard let url, let data = try? Data(contentsOf: url), let snap = try? decode(data) else { return .empty }
        return snap
    }

    public func write(to url: URL? = SharedContainer.snapshotURL) throws {
        guard let url else { return }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try encoded().write(to: url, options: .atomic)
    }
}
