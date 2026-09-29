import AppIntents
import WidgetKit

/// Checkbox tap in the widget: queue the change for the main app, flip it optimistically in the
/// snapshot, poke the app, reload.
struct ToggleItemIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle Item"
    static var isDiscoverable = false

    @Parameter(title: "Pin ID") var pinId: String
    @Parameter(title: "Item ID") var itemId: String
    @Parameter(title: "Kind") var kind: String
    @Parameter(title: "Checked") var checked: Bool

    init() {}

    init(item: WidgetSnapshot.Item) {
        pinId = item.pinId
        itemId = item.id
        kind = item.kind.rawValue
        checked = !item.checked
    }

    func perform() async throws -> some IntentResult {
        let itemKind = WidgetSnapshot.ItemKind(rawValue: kind) ?? .page
        try SharedInbox.shared?.append(.toggle(pinId: pinId, itemId: itemId, kind: itemKind, checked: checked))
        var snapshot = WidgetSnapshot.load()
        snapshot.setChecked(pinID: pinId, itemID: itemId, checked: checked)
        try? snapshot.write()
        SharedContainer.postInboxNotification()
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
