import Foundation
import Observation

public enum PinIcon: Codable, Sendable, Equatable {
    case emoji(String)
    case url(URL)
    case none

    public init(_ icon: Icon) {
        switch icon {
        case .emoji(let value): self = .emoji(value)
        case .external(let url), .file(let url): self = .url(url)
        case .none: self = .none
        }
    }
}

public enum PinKind: String, Codable, Sendable, Equatable {
    case page
    case dataSource
}

/// Where a pin's content lives. Absent in pins.json written before Apple Notes support, which
/// decodes to `.notion`. For `.appleNotes`, `Pin.notionId` holds the Notes id and `kind` is
/// `.page` for a note, `.dataSource` for a folder.
public enum PinSource: String, Codable, Sendable, Equatable {
    case notion
    case appleNotes
}

public enum DoneKind: String, Codable, Sendable, Equatable {
    case checkbox
    case status
}

public struct DatabaseConfig: Codable, Sendable, Equatable {
    public var doneProperty: String
    public var doneKind: DoneKind
    public var doneValue: String?
    public var dateProperty: String?
    public var showDone: Bool
    /// Additive (same backward-compat pattern as `customIcon`/`groupId`): a saved-view's extra
    /// AND-combined filters, on top of the done/not-done filter above.
    public var filters: [ViewFilter]?
    /// Additive: saved-view sort order. When present, replaces the single date/created-time
    /// sort `DatabaseViewModel` otherwise falls back to.
    public var sorts: [ViewSort]?
    /// Additive: a per-pin display name for this saved view, so the same database can be
    /// pinned multiple times (e.g. "This week", "Inbox") with distinct names/icons.
    public var viewName: String?

    public init(doneProperty: String, doneKind: DoneKind, doneValue: String? = nil, dateProperty: String? = nil, showDone: Bool = false, filters: [ViewFilter]? = nil, sorts: [ViewSort]? = nil, viewName: String? = nil) {
        self.doneProperty = doneProperty
        self.doneKind = doneKind
        self.doneValue = doneValue
        self.dateProperty = dateProperty
        self.showDone = showDone
        self.filters = filters
        self.sorts = sorts
        self.viewName = viewName
    }
}

/// A user-chosen appearance override for a pin's strip/panel icon, independent of whatever
/// icon the underlying Notion page/database has. `nil` on `Pin.customIcon` means "use the
/// Notion icon" (or the title's first letter, if Notion has none).
public enum CustomIcon: Codable, Sendable, Equatable {
    case emoji(String)
    case sfSymbol(name: String, colorHex: UInt32)
    case letter(text: String, colorHex: UInt32)

    private enum CodingKeys: String, CodingKey {
        case kind, value, name, colorHex
    }
    private enum Kind: String, Codable {
        case emoji, sfSymbol, letter
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Kind.self, forKey: .kind) {
        case .emoji:
            self = .emoji(try container.decode(String.self, forKey: .value))
        case .sfSymbol:
            self = .sfSymbol(name: try container.decode(String.self, forKey: .name), colorHex: try container.decode(UInt32.self, forKey: .colorHex))
        case .letter:
            self = .letter(text: try container.decode(String.self, forKey: .value), colorHex: try container.decode(UInt32.self, forKey: .colorHex))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .emoji(let value):
            try container.encode(Kind.emoji, forKey: .kind)
            try container.encode(value, forKey: .value)
        case .sfSymbol(let name, let colorHex):
            try container.encode(Kind.sfSymbol, forKey: .kind)
            try container.encode(name, forKey: .name)
            try container.encode(colorHex, forKey: .colorHex)
        case .letter(let text, let colorHex):
            try container.encode(Kind.letter, forKey: .kind)
            try container.encode(text, forKey: .value)
            try container.encode(colorHex, forKey: .colorHex)
        }
    }
}

public struct Pin: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var notionId: String
    public var kind: PinKind
    public var title: String
    public var icon: PinIcon
    public var order: Int
    public var config: DatabaseConfig?
    /// Additive: absent in pins.json written by earlier app versions, which decodes to `nil`
    /// (Swift's synthesized `Decodable` calls `decodeIfPresent` for `Optional` properties).
    public var customIcon: CustomIcon?
    /// Additive, same reasoning as `customIcon`: `nil` means "ungrouped", which is also how
    /// every pin in a pre-groups pins.json decodes, and how the "All pins" view is defined.
    public var groupId: String?
    /// Additive: where the pin's content lives; a missing key decodes to `.notion`.
    public var source: PinSource

    public init(id: String = UUID().uuidString, notionId: String, kind: PinKind, title: String, icon: PinIcon, order: Int, config: DatabaseConfig? = nil, customIcon: CustomIcon? = nil, groupId: String? = nil, source: PinSource = .notion) {
        self.source = source
        self.id = id
        self.notionId = notionId
        self.kind = kind
        self.title = title
        self.icon = icon
        self.order = order
        self.config = config
        self.customIcon = customIcon
        self.groupId = groupId
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        notionId = try c.decode(String.self, forKey: .notionId)
        kind = try c.decode(PinKind.self, forKey: .kind)
        title = try c.decode(String.self, forKey: .title)
        icon = try c.decode(PinIcon.self, forKey: .icon)
        order = try c.decode(Int.self, forKey: .order)
        config = try c.decodeIfPresent(DatabaseConfig.self, forKey: .config)
        customIcon = try c.decodeIfPresent(CustomIcon.self, forKey: .customIcon)
        groupId = try c.decodeIfPresent(String.self, forKey: .groupId)
        source = (try? c.decodeIfPresent(PinSource.self, forKey: .source)) ?? .notion
    }

    public var isAppleNotes: Bool { source == .appleNotes }
}

/// A user-defined pin group. Stored separately from `pins.json` (in `groups.json`) so older
/// app versions' pins file stays byte-for-byte untouched by this feature.
public struct PinGroup: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var emoji: String?
    public var order: Int

    public init(id: String = UUID().uuidString, name: String, emoji: String? = nil, order: Int) {
        self.id = id
        self.name = name
        self.emoji = emoji
        self.order = order
    }
}

@MainActor
@Observable
public final class PinStore {
    public private(set) var pins: [Pin] = []
    public private(set) var groups: [PinGroup] = []
    private let fileURL: URL
    private let groupsFileURL: URL

    public init(fileURL: URL = AppStorageLocation.pinsFile, groupsFileURL: URL = AppStorageLocation.groupsFile) {
        self.fileURL = fileURL
        self.groupsFileURL = groupsFileURL
        load()
        loadGroups()
    }

    public func add(_ pin: Pin) {
        var pin = pin
        pin.order = (pins.map(\.order).max() ?? -1) + 1
        pins.append(pin)
        save()
    }

    public func remove(id: String) {
        pins.removeAll { $0.id == id }
        save()
    }

    public func move(fromOffsets: IndexSet, toOffset: Int) {
        let moving = fromOffsets.map { pins[$0] }
        var remaining = pins
        for index in fromOffsets.sorted(by: >) { remaining.remove(at: index) }
        let insertionIndex = fromOffsets.filter { $0 < toOffset }.count
        let adjustedOffset = toOffset - insertionIndex
        remaining.insert(contentsOf: moving, at: min(adjustedOffset, remaining.count))
        for (index, _) in remaining.enumerated() { remaining[index].order = index }
        pins = remaining
        save()
    }

    /// Reorders `pinID` to `toIndex` within the pins that share `groupID` (`nil` = ungrouped),
    /// leaving every other pin's relative order untouched. Used by the strip's drag-to-reorder
    /// when a specific group is active.
    public func move(pinID: String, toIndex: Int, withinGroup groupID: String?) {
        reorder(pinID: pinID, toIndex: toIndex, within: pins.filter { $0.groupId == groupID })
    }

    /// Reorders `pinID` to `toIndex` among *every* pin, regardless of group. Used by the
    /// strip's drag-to-reorder when the "All pins" view is active.
    public func moveAmongAllPins(pinID: String, toIndex: Int) {
        reorder(pinID: pinID, toIndex: toIndex, within: pins)
    }

    private func reorder(pinID: String, toIndex: Int, within scope: [Pin]) {
        var scopePins = scope.sorted { $0.order < $1.order }
        guard let fromIndex = scopePins.firstIndex(where: { $0.id == pinID }) else { return }
        let moving = scopePins.remove(at: fromIndex)
        let clampedIndex = min(max(toIndex, 0), scopePins.count)
        scopePins.insert(moving, at: clampedIndex)
        for (offset, scopePin) in scopePins.enumerated() {
            guard let index = pins.firstIndex(where: { $0.id == scopePin.id }) else { continue }
            pins[index].order = offset
        }
        pins.sort { $0.order < $1.order }
        save()
    }

    public func update(_ pin: Pin) {
        guard let index = pins.firstIndex(where: { $0.id == pin.id }) else { return }
        pins[index] = pin
        save()
    }

    /// Moves a pin into `groupID` (`nil` = ungrouped/"All pins"), appended after that group's
    /// current pins.
    public func setGroup(pinID: String, groupID: String?) {
        guard let index = pins.firstIndex(where: { $0.id == pinID }) else { return }
        pins[index].groupId = groupID
        let maxOrderInGroup = pins.filter { $0.groupId == groupID && $0.id != pinID }.map(\.order).max() ?? -1
        pins[index].order = maxOrderInGroup + 1
        save()
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        pins = (try? JSONDecoder().decode([Pin].self, from: data))?.sorted { $0.order < $1.order } ?? []
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(pins.sorted { $0.order < $1.order }) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    // MARK: - Groups

    @discardableResult
    public func addGroup(name: String, emoji: String?) -> PinGroup {
        let group = PinGroup(name: name, emoji: emoji, order: (groups.map(\.order).max() ?? -1) + 1)
        groups.append(group)
        saveGroups()
        return group
    }

    public func renameGroup(id: String, name: String, emoji: String?) {
        guard let index = groups.firstIndex(where: { $0.id == id }) else { return }
        groups[index].name = name
        groups[index].emoji = emoji
        saveGroups()
    }

    /// Deletes the group; its pins are ungrouped (`groupId = nil`), not deleted.
    public func deleteGroup(id: String) {
        groups.removeAll { $0.id == id }
        for index in pins.indices where pins[index].groupId == id {
            pins[index].groupId = nil
        }
        saveGroups()
        save()
    }

    public func moveGroup(fromOffsets: IndexSet, toOffset: Int) {
        let moving = fromOffsets.map { groups[$0] }
        var remaining = groups
        for index in fromOffsets.sorted(by: >) { remaining.remove(at: index) }
        let insertionIndex = fromOffsets.filter { $0 < toOffset }.count
        let adjustedOffset = toOffset - insertionIndex
        remaining.insert(contentsOf: moving, at: min(adjustedOffset, remaining.count))
        for (index, _) in remaining.enumerated() { remaining[index].order = index }
        groups = remaining
        saveGroups()
    }

    private func loadGroups() {
        guard let data = try? Data(contentsOf: groupsFileURL) else { return }
        groups = (try? JSONDecoder().decode([PinGroup].self, from: data))?.sorted { $0.order < $1.order } ?? []
    }

    private func saveGroups() {
        guard let data = try? JSONEncoder().encode(groups.sorted { $0.order < $1.order }) else { return }
        try? data.write(to: groupsFileURL, options: .atomic)
    }
}
