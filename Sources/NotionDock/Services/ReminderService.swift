import Foundation
import Observation
import UserNotifications
import NotionKit

/// Due reminders as local notifications. The plan (what to schedule) is `ReminderPlanner`;
/// this class asks for permission lazily, syncs the pending requests with the plan whenever
/// summaries refresh, and handles the notification buttons.
@MainActor
@Observable
final class ReminderService: NSObject, UNUserNotificationCenterDelegate {
    static let shared = ReminderService()

    /// Set when the user turned reminders on but macOS notifications are blocked for Brink.
    private(set) var permissionDenied = false

    private static let itemCategory = "brink.item"
    private static let summaryCategory = "brink.summary"
    private static let snoozePrefix = "brink.snooze."
    private static let planCap = ReminderPlanner.maxPending

    @ObservationIgnored private var appModel: AppModel?
    @ObservationIgnored private var task: Task<Void, Never>?
    @ObservationIgnored private var peekTimer: Timer?
    @ObservationIgnored private var upcoming: [ReminderRequest] = []

    /// Notifications need a real app bundle (not `swift run`), and demo mode must not schedule any.
    private var isAvailable: Bool { Bundle.main.bundleURL.pathExtension == "app" && !DemoMode.isActive }

    func start(appModel: AppModel) {
        self.appModel = appModel
        guard isAvailable else { return }
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let done = UNNotificationAction(identifier: "done", title: "Mark done")
        let snooze = UNNotificationAction(identifier: "snooze", title: "Snooze 1 hour")
        let open = UNNotificationAction(identifier: "open", title: "Open", options: [.foreground])
        center.setNotificationCategories([
            UNNotificationCategory(identifier: Self.itemCategory, actions: [done, snooze, open], intentIdentifiers: []),
            UNNotificationCategory(identifier: Self.summaryCategory, actions: [open], intentIdentifiers: []),
        ])
        scheduleSoon(delay: 1.5)
    }

    /// Hop-to-main entry for `Settings` (which is not main-actor isolated).
    nonisolated static func settingsChanged() {
        Task { @MainActor in shared.settingsDidChange() }
    }

    /// Called by `Settings` when any reminder setting changes. The permission prompt appears
    /// here, the first time reminders are switched on.
    func settingsDidChange() {
        guard isAvailable else { return }
        guard Settings.shared.remindersEnabled else { permissionDenied = false; scheduleSoon(delay: 0); return }
        Task { @MainActor in
            let center = UNUserNotificationCenter.current()
            var status = await center.notificationSettings().authorizationStatus
            if status == .notDetermined {
                _ = try? await center.requestAuthorization(options: [.alert, .sound])
                status = await center.notificationSettings().authorizationStatus
            }
            let allowed = status == .authorized || status == .provisional
            permissionDenied = !allowed
            if !allowed { Settings.shared.remindersEnabled = false; return }
            scheduleSoon(delay: 0.3)
        }
    }

    /// Debounced: summaries refresh pin by pin, so several land in a burst.
    func summariesDidChange() { scheduleSoon(delay: 1.0) }

    private func scheduleSoon(delay: TimeInterval) {
        guard isAvailable else { return }
        task?.cancel()
        task = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            if !Task.isCancelled { await self?.reschedule() }
        }
    }

    // MARK: - Scheduling

    private func reschedule() async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        let managed = pending.filter { $0.identifier.hasPrefix(ReminderPlanner.itemPrefix) || $0.identifier.hasPrefix(ReminderPlanner.summaryPrefix) }
        let snoozes = pending.filter { $0.identifier.hasPrefix(Self.snoozePrefix) }
        guard Settings.shared.remindersEnabled, let appModel else {
            center.removePendingNotificationRequests(withIdentifiers: (managed + snoozes).map(\.identifier))
            setUpcoming([])
            return
        }
        let service = PinSummaryService.shared
        let pins = appModel.pinStore.pins.filter(TodayAggregator.isEligible)
        let known = Set(pins.filter { service.summaries[$0.id] != nil }.map(\.id))
        let items = pins.flatMap { service.summaries[$0.id]?.dueItems ?? [] }
        let openIDs = Set(items.map(\.id))

        // Snoozes of items that are now done or gone; keep the rest.
        let staleSnoozes = snoozes.filter { r in
            guard let pinId = r.content.userInfo["pinId"] as? String, let itemId = r.content.userInfo["itemId"] as? String else { return true }
            return known.contains(pinId) && !openIDs.contains(itemId)
        }
        center.removePendingNotificationRequests(withIdentifiers: staleSnoozes.map(\.identifier))
        // Pins whose summary has not loaded yet keep what was scheduled for them.
        let kept = managed.filter { r in
            r.identifier.hasPrefix(ReminderPlanner.itemPrefix) && !known.contains(r.content.userInfo["pinId"] as? String ?? "")
        }
        let reserved = kept.count + snoozes.count - staleSnoozes.count

        let settings = ReminderSettings(dateOnlyHour: Settings.shared.reminderHour, morningSummaryEnabled: Settings.shared.morningSummaryEnabled,
                                        morningSummaryMinutes: Settings.shared.morningSummaryMinutes)
        let titles = Dictionary(pins.map { ($0.id, $0.title) }, uniquingKeysWith: { a, _ in a })
        let plan = ReminderPlanner.plan(items: items, pinTitles: titles, now: Date(), settings: settings, limit: max(Self.planCap - reserved, 0))

        let keepIDs = Set(plan.map(\.identifier)).union(kept.map(\.identifier))
        center.removePendingNotificationRequests(withIdentifiers: managed.map(\.identifier).filter { !keepIDs.contains($0) })
        let existing = Dictionary(managed.map { ($0.identifier, $0) }, uniquingKeysWith: { a, _ in a })
        for request in plan where !Self.isUnchanged(request, existing[request.identifier]) {
            try? await center.add(Self.notificationRequest(for: request))
        }
        setUpcoming(plan.filter { $0.kind == .item })
    }

    private static func components(_ date: Date) -> DateComponents {
        Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
    }

    private static func isUnchanged(_ request: ReminderRequest, _ existing: UNNotificationRequest?) -> Bool {
        guard let existing, let trigger = existing.trigger as? UNCalendarNotificationTrigger else { return false }
        return existing.content.title == request.title && existing.content.body == request.body
            && trigger.dateComponents == components(request.fireDate)
    }

    private static func notificationRequest(for request: ReminderRequest) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = request.title
        content.body = request.body
        content.sound = .default
        content.categoryIdentifier = request.kind == .item ? itemCategory : summaryCategory
        content.userInfo = ["pinId": request.pinId ?? TodayPin.id, "itemId": request.itemId ?? ""]
        if let pinId = request.pinId { content.threadIdentifier = pinId }
        let trigger = UNCalendarNotificationTrigger(dateMatching: components(request.fireDate), repeats: false)
        return UNNotificationRequest(identifier: request.identifier, content: content, trigger: trigger)
    }

    // MARK: - Peek while running

    private func setUpcoming(_ items: [ReminderRequest]) {
        upcoming = items
        armPeekTimer()
    }

    private func armPeekTimer() {
        peekTimer?.invalidate()
        peekTimer = nil
        guard Settings.shared.remindersEnabled, Settings.shared.peekForReminders,
              let next = upcoming.first(where: { $0.fireDate > Date() }) else { return }
        let timer = Timer(fire: next.fireDate, interval: 0, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                if Settings.shared.peekForReminders, let pinId = next.pinId {
                    NotificationCenter.default.post(name: .reminderPeekRequested, object: pinId)
                }
                self.upcoming.removeAll { $0.fireDate <= next.fireDate }
                self.armPeekTimer()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        peekTimer = timer
    }

    // MARK: - UNUserNotificationCenterDelegate

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let pinId = info["pinId"] as? String ?? ""
        let itemId = info["itemId"] as? String ?? ""
        let action = response.actionIdentifier
        let request = response.notification.request
        await MainActor.run {
            switch action {
            case "done":
                Task { @MainActor in
                    SoundService.shared.tick()
                    await ItemActions.shared.markDone(pinID: pinId, itemID: itemId)
                    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.snoozePrefix + itemId])
                }
            case "snooze":
                let content = request.content.mutableCopy() as? UNMutableNotificationContent ?? UNMutableNotificationContent()
                let snoozed = UNNotificationRequest(identifier: Self.snoozePrefix + itemId, content: content,
                                                    trigger: UNTimeIntervalNotificationTrigger(timeInterval: 3600, repeats: false))
                UNUserNotificationCenter.current().add(snoozed) { _ in }
            default: // "open" and a click on the notification itself
                if !pinId.isEmpty { NotificationCenter.default.post(name: .openPinInNotchRequested, object: pinId) }
            }
        }
    }
}
