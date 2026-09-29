import Foundation
import NotionKit

/// Applies actions the widget / Share extension appended to the shared inbox: on the
/// "cz.stepanblaha.brink.inbox" Darwin notification, at launch and every 60 s. Writes go
/// through the same paths as the menu-bar tick and quick capture (WriteQueue).
@MainActor
final class SharedInboxProcessor {
    static let shared = SharedInboxProcessor()

    private var appModel: AppModel?
    private var timer: Timer?
    private var isProcessing = false
    private var runAgain = false

    static func start(appModel: AppModel) { shared.start(appModel: appModel) }

    private func start(appModel: AppModel) {
        guard self.appModel == nil, SharedContainer.isUsable else { return }
        self.appModel = appModel
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        CFNotificationCenterAddObserver(center, nil, { _, _, _, _, _ in
            Task { @MainActor in SharedInboxProcessor.shared.process() }
        }, SharedContainer.inboxNotificationName as CFString, nil, .deliverImmediately)
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in
            MainActor.assumeIsolated { SharedInboxProcessor.shared.process() }
        }
        process()
    }

    func process() {
        guard let appModel, appModel.hasToken, let inbox = SharedInbox.shared else { return }
        if isProcessing { runAgain = true; return }
        let entries = inbox.readAll()
        guard !entries.isEmpty else { return }
        isProcessing = true
        Task { @MainActor in
            var handled: Set<String> = []
            var changedPins: Set<String> = []
            for entry in entries {
                if let pinID = await apply(entry.action, appModel: appModel) { changedPins.insert(pinID) }
                handled.insert(entry.id)
            }
            do { try inbox.remove(ids: handled) } catch { NSLog("Brink: inbox cleanup failed: \(error)") }
            for id in changedPins { NotificationCenter.default.post(name: .pinContentDidChange, object: id) }
            SharedSnapshotWriter.shared.forceWrite()
            isProcessing = false
            if runAgain { runAgain = false; process() }
        }
    }

    /// Returns the affected pin id when something was written (or queued).
    private func apply(_ action: InboxAction, appModel: AppModel) async -> String? {
        let pins = appModel.pinStore.pins
        switch action {
        case .toggle(let pinId, let itemId, _, let checked):
            guard let pin = pins.first(where: { $0.id == pinId }), let operation = InboxCapture.toggleOperation(pin: pin, itemId: itemId, checked: checked) else { return nil }
            if checked { SoundService.shared.tick() }
            return await submit(operation, pin: pin, appModel: appModel, toast: nil)
        case .capture(let text, let url, let pinId):
            let fallback = UserDefaults.standard.string(forKey: QuickCaptureModel.lastPinKey)
            guard let result = InboxCapture.plan(text: text, url: url, pinId: pinId, pins: pins, fallbackID: fallback) else { return nil }
            return await submit(result.plan.operation, pin: result.pin, appModel: appModel, toast: "Added to \(result.pin.title) ✓")
        }
    }

    private func submit(_ operation: PendingWrite.Operation, pin: Pin, appModel: AppModel, toast: String?) async -> String? {
        switch await appModel.writeQueue.submit(operation, using: appModel.client) {
        case .saved:
            if let toast { CaptureToast.show(toast) }
            return pin.id
        case .queued:
            if toast != nil { CaptureToast.show("Saved offline, will sync") }
            return pin.id
        case .failed(let message):
            CaptureToast.show(message, isError: true)
            return nil
        }
    }
}
