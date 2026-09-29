import Foundation

extension WidgetSnapshot {
    /// Builds the widget snapshot from the pin list and current summaries.
    public static func build(pins: [Pin], summaries: [String: PinSummary], activeGroupID: String?, now: Date = Date()) -> WidgetSnapshot {
        let entries = pins
            .sorted { $0.order != $1.order ? $0.order < $1.order : $0.title < $1.title }
            .map { pin -> PinEntry in
                let summary = summaries[pin.id]
                let kind: ItemKind = pin.kind == .page ? .page : .db
                let next = (summary?.nextRefs ?? []).map { Item(id: $0.id, pinId: pin.id, title: $0.title, kind: kind) }
                return PinEntry(id: pin.id, title: pin.title, icon: iconText(for: pin), openCount: summary?.openCount ?? 0,
                                dueToday: summary?.dueTodayCount ?? 0, groupId: pin.groupId, kind: kind, next: next)
            }
        return WidgetSnapshot(generatedAt: now, activeGroupID: activeGroupID, pins: entries)
    }

    /// Custom emoji/letter first, then the Notion emoji, then the title's first letter.
    public static func iconText(for pin: Pin) -> String {
        switch pin.customIcon {
        case .emoji(let e)?: return e
        case .letter(let text, _)?: return text
        default: break
        }
        if case .emoji(let e) = pin.icon { return e }
        return pin.title.first.map { String($0).uppercased() } ?? "•"
    }
}
