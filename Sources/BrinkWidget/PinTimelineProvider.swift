import WidgetKit

struct PinWidgetEntry: TimelineEntry {
    let date: Date
    let title: String
    let icon: String
    let openCount: Int
    let dueToday: Int
    /// Set when the widget shows a single pin (tap opens it in the notch).
    let pinID: String?
    let items: [WidgetSnapshot.Item]
    let isEmpty: Bool

    static let placeholder = PinWidgetEntry(
        date: Date(), title: "Inbox", icon: "📥", openCount: 4, dueToday: 1, pinID: nil,
        items: ["Reply to Jana", "Book dentist", "Ship widget", "Buy milk", "Plan week", "Read paper", "Call mum"]
            .enumerated().map { WidgetSnapshot.Item(id: "\($0.offset)", pinId: "p", title: $0.element, kind: .page) },
        isEmpty: false)

    static func make(for choice: PinChoiceEntity?, snapshot: WidgetSnapshot, date: Date = Date()) -> PinWidgetEntry {
        let id = choice?.id ?? PinChoiceEntity.activeID
        if let pin = snapshot.pins.first(where: { $0.id == id }) {
            return PinWidgetEntry(date: date, title: pin.title, icon: pin.icon, openCount: pin.openCount, dueToday: pin.dueToday,
                                  pinID: pin.id, items: pin.next, isEmpty: false)
        }
        let pins = id == PinChoiceEntity.allID ? snapshot.pins : snapshot.activePins
        let title = id == PinChoiceEntity.allID ? "All pins" : (snapshot.activeGroupID == nil ? "All pins" : "Active group")
        return PinWidgetEntry(date: date, title: title, icon: "◉",
                              openCount: pins.reduce(0) { $0 + $1.openCount }, dueToday: pins.reduce(0) { $0 + $1.dueToday },
                              pinID: nil, items: pins.flatMap(\.next), isEmpty: snapshot.pins.isEmpty)
    }
}

struct PinTimelineProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> PinWidgetEntry { .placeholder }

    func snapshot(for configuration: PinWidgetConfigIntent, in context: Context) async -> PinWidgetEntry {
        let snap = WidgetSnapshot.load()
        return snap.pins.isEmpty && context.isPreview ? .placeholder : .make(for: configuration.pin, snapshot: snap)
    }

    func timeline(for configuration: PinWidgetConfigIntent, in context: Context) async -> Timeline<PinWidgetEntry> {
        let entry = PinWidgetEntry.make(for: configuration.pin, snapshot: .load())
        // The app reloads timelines whenever its data changes; this is just a safety net.
        return Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(30 * 60)))
    }
}
