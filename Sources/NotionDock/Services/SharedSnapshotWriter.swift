import Foundation
import Observation
import WidgetKit
import NotionKit

/// Publishes pins + summaries to the App Group container for the widget / Share extension,
/// throttled, and asks WidgetKit to reload. No-op when the app lacks the app-group
/// entitlement (e.g. the ad-hoc SwiftPM build).
@MainActor
final class SharedSnapshotWriter {
    static let shared = SharedSnapshotWriter()

    private var appModel: AppModel?
    private var pendingWrite: Task<Void, Never>?
    private var lastWritten: WidgetSnapshot?
    private var observers: [NSObjectProtocol] = []
    private let throttle: TimeInterval = 2

    static func start(appModel: AppModel) { shared.start(appModel: appModel) }

    private func start(appModel: AppModel) {
        guard self.appModel == nil, SharedContainer.isEntitled else { return }
        self.appModel = appModel
        track()
        observers.append(NotificationCenter.default.addObserver(forName: UserDefaults.didChangeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.lastWritten?.activeGroupID != Settings.shared.activeGroupID else { return }
                self.scheduleWrite()
            }
        })
        scheduleWrite(immediately: true)
    }

    /// Re-arms observation of the pin list and summaries; any change schedules a write.
    private func track() {
        guard let appModel else { return }
        withObservationTracking {
            _ = appModel.pinStore.pins
            _ = PinSummaryService.shared.summaries
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.scheduleWrite()
                self?.track()
            }
        }
    }

    /// Rewrites even if nothing changed, after the summary refresh has had time to land, so a
    /// widget's optimistic edit never outlives a failed/ignored write.
    func forceWrite(after delay: TimeInterval = 8) {
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            self?.lastWritten = nil
            self?.scheduleWrite(immediately: true)
        }
    }

    func scheduleWrite(immediately: Bool = false) {
        guard pendingWrite == nil else { return }
        let delay = immediately ? 0 : throttle
        pendingWrite = Task { @MainActor [weak self] in
            if delay > 0 { try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000)) }
            self?.pendingWrite = nil
            self?.writeNow()
        }
    }

    private func writeNow() {
        guard let appModel else { return }
        let snapshot = WidgetSnapshot.build(pins: appModel.pinStore.pins, summaries: PinSummaryService.shared.summaries,
                                            activeGroupID: Settings.shared.activeGroupID)
        var comparable = snapshot
        comparable.generatedAt = lastWritten?.generatedAt ?? snapshot.generatedAt
        guard comparable != lastWritten else { return }
        do {
            try snapshot.write()
            lastWritten = snapshot
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            NSLog("Brink: snapshot write failed: \(error)")
        }
    }
}
