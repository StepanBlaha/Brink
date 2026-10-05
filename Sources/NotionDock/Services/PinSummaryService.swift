import Foundation
import Observation
import NotionKit

/// Per-pin glanceable counts for badges, hover peeks and the live pill. All network work goes
/// through the shared rate-limited `NotionClient`; refreshes are staggered and at most one
/// runs per pin at a time.
@MainActor
@Observable
final class PinSummaryService {
    static let shared = PinSummaryService()

    private(set) var summaries: [String: PinSummary] = [:]

    @ObservationIgnored private var appModel: AppModel?
    @ObservationIgnored private var inFlight: Set<String> = []
    @ObservationIgnored private var pendingAgain: Set<String> = []
    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private var observers: [NSObjectProtocol] = []
    private static let childFetchLimit = 6

    func summary(for pinID: String) -> PinSummary? {
        TodayPin.isToday(pinID) ? todaySummary() : summaries[pinID]
    }

    func start(appModel: AppModel) {
        guard self.appModel == nil else { return }
        self.appModel = appModel
        // Instant values from cache, then a staggered network refresh.
        for pin in appModel.pinStore.pins { applyCached(pin) }
        refreshAll(stagger: 0.4)
        timer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.refreshAll(stagger: 0.6) }
        }
        observers.append(NotificationCenter.default.addObserver(forName: .pinContentDidChange, object: nil, queue: .main) { [weak self] note in
            let id = note.object as? String
            MainActor.assumeIsolated {
                if let id { self?.refresh(pinID: id) } else { self?.refreshAll(stagger: 0.4) }
            }
        })
    }

    /// Call when the pin list may have changed (pin added/removed).
    func pinsDidChange() {
        guard let appModel else { return }
        let ids = Set(appModel.pinStore.pins.map(\.id))
        summaries = summaries.filter { ids.contains($0.key) }
        for pin in appModel.pinStore.pins where summaries[pin.id] == nil {
            applyCached(pin)
            refresh(pinID: pin.id)
        }
        ReminderService.shared.summariesDidChange()
    }

    func refreshAll(stagger: TimeInterval) {
        guard let appModel else { return }
        for (index, pin) in appModel.pinStore.pins.enumerated() {
            let id = pin.id
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(Double(index) * stagger * 1_000_000_000))
                self?.refresh(pinID: id)
            }
        }
    }

    func refresh(pinID: String) {
        guard let appModel, let pin = appModel.pinStore.pins.first(where: { $0.id == pinID }) else { return }
        if pin.source == .appleNotes { refreshNotes(pin, appModel: appModel); return }
        guard appModel.hasToken else { return }
        if inFlight.contains(pinID) { pendingAgain.insert(pinID); return }
        inFlight.insert(pinID)
        let client = appModel.client
        Task { [weak self] in
            let result = await Self.compute(pin: pin, client: client)
            guard let self else { return }
            if let result {
                self.summaries[pinID] = result
                ReminderService.shared.summariesDidChange()
            }
            self.inFlight.remove(pinID)
            if self.pendingAgain.remove(pinID) != nil { self.refresh(pinID: pinID) }
        }
    }

    /// Folder pins badge their note count. Note pins have no badge. Never launches Notes or
    /// prompts: it only reads while Notes is already running and access was granted.
    private func refreshNotes(_ pin: Pin, appModel: AppModel) {
        guard pin.kind == .dataSource, !inFlight.contains(pin.id) else { return }
        inFlight.insert(pin.id)
        let pinID = pin.id
        Task { [weak self] in
            defer { self?.inFlight.remove(pinID) }
            if appModel.notesAccess == .unknown { await appModel.refreshNotesAccess() }
            guard appModel.notesAccess == .allowed, DemoMode.isActive || NotesPermission.isRunning,
                  let notes = try? await appModel.notes.notes(inFolder: pin.notionId) else { return }
            self?.summaries[pinID] = NotesCapture.summary(forFolderNotes: notes)
        }
    }

    private func applyCached(_ pin: Pin) {
        guard let appModel, pin.source == .notion else { return }
        switch pin.kind {
        case .page:
            if let blocks = appModel.cache.loadBlocks(forPin: pin.id) { summaries[pin.id] = PinSummary.fromBlocks(blocks) }
        case .dataSource:
            if let config = pin.config, let rows = appModel.cache.loadRows(forPin: pin.id) {
                summaries[pin.id] = PinSummary.fromRows(rows, config: config, today: PinSummary.dayString(), pinId: pin.id)
            }
        }
    }

    private static func compute(pin: Pin, client: NotionClient) async -> PinSummary? {
        do {
            switch pin.kind {
            case .page:
                let top = try await client.blockChildren(pin.notionId)
                var all: [Block] = []
                var fetched = 0
                for block in top {
                    all.append(block)
                    guard block.hasChildren, fetched < childFetchLimit else { continue }
                    switch block.type {
                    case .toDo, .toggle, .bulletedListItem, .numberedListItem:
                        fetched += 1
                        all.append(contentsOf: (try? await client.blockChildren(block.id)) ?? [])
                    default: break
                    }
                }
                return PinSummary.fromBlocks(all)
            case .dataSource:
                guard let config = pin.config else { return nil }
                let filter = config.filters.flatMap { ViewQueryBuilder.filterJSON($0) }
                let rows = try await client.queryDataSource(pin.notionId, filter: filter)
                return PinSummary.fromRows(rows, config: config, today: PinSummary.dayString(), pinId: pin.id)
            }
        } catch {
            return nil
        }
    }

    // MARK: - Derived

    /// Everything due today or overdue across the database pins (the Today view's data).
    func todayDigest(now: Date = Date()) -> TodayDigest {
        guard let appModel else { return TodayDigest(sections: []) }
        return TodayAggregator.aggregate(pins: appModel.pinStore.pins, summaries: summaries, now: now)
    }

    var hasDatabasePins: Bool { appModel?.pinStore.pins.contains { $0.kind == .dataSource } ?? false }

    /// The Today pin's badge and hover peek: open = due today or overdue.
    private func todaySummary() -> PinSummary {
        let items = todayDigest().items
        var s = PinSummary.empty
        s.openCount = items.count
        s.total = items.count
        s.dueTodayCount = items.count
        s.nextItems = items.prefix(PinSummary.nextItemLimit).map(\.title)
        s.nextRefs = items.prefix(PinSummary.nextRefLimit).map { PinSummary.ItemRef(id: $0.id, title: $0.title) }
        return s
    }

    /// done/total across the pins for the pill; `nil` = nothing to show.
    func progressRatio(pinIDs: [String]) -> Double? {
        PinSummary.progressRatio(pinIDs.compactMap { summaries[$0] })
    }
}
