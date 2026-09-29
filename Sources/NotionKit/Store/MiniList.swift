import Foundation

/// One collapsible section of the menu-bar mini-list.
public struct MiniListSection: Equatable, Identifiable, Sendable {
    public var id: String { pinID }
    public let pinID: String
    public let title: String
    public let kind: PinKind
    public let openCount: Int

    public init(pinID: String, title: String, kind: PinKind, openCount: Int) {
        self.pinID = pinID
        self.title = title
        self.kind = kind
        self.openCount = openCount
    }
}

/// Pure model helpers for the menu-bar mini-list.
public enum MiniList {
    /// Pins in the active group (or all pins when `activeGroupID` is nil or no longer exists),
    /// sorted by pin order, paired with their open counts (0 when no summary is known yet).
    public static func sections(
        pins: [Pin],
        summaries: [String: PinSummary],
        groups: [PinGroup],
        activeGroupID: String?
    ) -> [MiniListSection] {
        let scoped: [Pin]
        if let activeGroupID, groups.contains(where: { $0.id == activeGroupID }) {
            scoped = pins.filter { $0.groupId == activeGroupID }
        } else {
            scoped = pins
        }
        return scoped
            .sorted { $0.order != $1.order ? $0.order < $1.order : $0.title < $1.title }
            .map { MiniListSection(pinID: $0.id, title: $0.title, kind: $0.kind, openCount: summaries[$0.id]?.openCount ?? 0) }
    }

    /// Total open items across all pins (for the status item title).
    public static func totalOpen(pins: [Pin], summaries: [String: PinSummary]) -> Int {
        pins.reduce(0) { $0 + (summaries[$1.id]?.openCount ?? 0) }
    }

    /// Text for the status item: empty when off or nothing is open.
    public static func statusTitle(totalOpen: Int, showCount: Bool) -> String {
        guard showCount, totalOpen > 0 else { return "" }
        return " \(totalOpen > 99 ? "99+" : String(totalOpen))"
    }
}

/// Rate limiter for the check-off tick: allows at most one event per `minInterval`.
public struct TickThrottle {
    public let minInterval: TimeInterval
    private var last: Date?

    public init(minInterval: TimeInterval = 0.08) { self.minInterval = minInterval }

    /// Returns true (and records `now`) if an event may fire.
    public mutating func allow(now: Date) -> Bool {
        if let last, now.timeIntervalSince(last) < minInterval { return false }
        last = now
        return true
    }
}
