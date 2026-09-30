import Foundation
import NotionKit

/// The one write path for acting on a single task from outside its own panel (hover peek,
/// notification buttons, the Today view): queue the write, then tell summaries to refresh.
@MainActor
final class ItemActions {
    static let shared = ItemActions()
    private var appModel: AppModel?

    func configure(appModel: AppModel) { self.appModel = appModel }

    private func pin(_ id: String) -> Pin? { appModel?.pinStore.pins.first { $0.id == id } }

    /// Marks a to-do / task done (`InboxCapture.toggleOperation` + `WriteQueue`).
    @discardableResult
    func markDone(pinID: String, itemID: String) async -> Bool {
        guard let appModel, let pin = pin(pinID),
              let operation = InboxCapture.toggleOperation(pin: pin, itemId: itemID, checked: true) else { return false }
        return await submit(operation, pinID: pinID, appModel: appModel)
    }

    /// Moves a task's date (Today view snooze). Later-today needs a time; the calculator keeps a time of day.
    @discardableResult
    func snooze(_ item: TodayItem, _ option: SnoozeOption) async -> Bool {
        guard let appModel, let property = pin(item.pinId)?.config?.dateProperty else { return false }
        if option == .laterToday, !item.hasTime { return false }
        let target = SnoozeCalculator.target(option, current: item.due, currentHasTime: item.hasTime)
        let iso = NaturalDate.isoString(target.date, hasTime: target.hasTime)
        let op = PendingWrite.Operation.updateProperty(pageId: item.id, updates: [PropertyUpdate(name: property, value: .date(start: iso, end: nil))])
        return await submit(op, pinID: item.pinId, appModel: appModel)
    }

    private func submit(_ operation: PendingWrite.Operation, pinID: String, appModel: AppModel) async -> Bool {
        var ok = true
        switch await appModel.writeQueue.submit(operation, using: appModel.client) {
        case .saved, .queued: break
        case .failed(let message):
            CaptureToast.show(message, isError: true)
            ok = false
        }
        NotificationCenter.default.post(name: .pinContentDidChange, object: pinID)
        return ok
    }
}
