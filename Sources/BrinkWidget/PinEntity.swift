import AppIntents
import WidgetKit

/// A widget source: one pin from the snapshot, or the "All pins" / "Active group" aggregates.
struct PinChoiceEntity: AppEntity {
    static let allID = "__all__"
    static let activeID = "__active__"

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Pin"
    static var defaultQuery = PinChoiceQuery()

    var id: String
    var title: String
    var icon: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(icon)  \(title)")
    }

    static let all = PinChoiceEntity(id: allID, title: "All pins", icon: "◎")
    static let active = PinChoiceEntity(id: activeID, title: "Active group", icon: "◉")

    static func choices(in snapshot: WidgetSnapshot = .load()) -> [PinChoiceEntity] {
        [.active, .all] + snapshot.pins.map { PinChoiceEntity(id: $0.id, title: $0.title, icon: $0.icon) }
    }
}

struct PinChoiceQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [PinChoiceEntity] {
        let choices = PinChoiceEntity.choices()
        return identifiers.compactMap { id in choices.first { $0.id == id } }
    }

    func suggestedEntities() async throws -> [PinChoiceEntity] { PinChoiceEntity.choices() }

    func defaultResult() async -> PinChoiceEntity? { .active }
}

struct PinWidgetConfigIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Choose Pin"
    static var description = IntentDescription("Which pin (or group of pins) the widget shows.")

    @Parameter(title: "Pin")
    var pin: PinChoiceEntity?

    init() {}
    init(pin: PinChoiceEntity?) { self.pin = pin }
}
