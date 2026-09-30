import SwiftUI
import Observation
import NotionKit

/// State for the Today panel: which rows were just ticked or snoozed and are on their way out,
/// while the summaries catch up with the write.
@MainActor
@Observable
final class TodayModel {
    /// Ticked rows still showing (checked, struck through) before they leave.
    private(set) var checkedIDs: Set<String> = []
    /// Rows that left the list (done or snoozed away) and may not have dropped out of the summaries yet.
    private(set) var goneIDs: Set<String> = []

    var digest: TodayDigest { PinSummaryService.shared.todayDigest() }

    /// The digest without rows that already left.
    var visibleSections: [TodaySection] {
        digest.sections.compactMap { section in
            let items = section.items.filter { !goneIDs.contains($0.id) }
            return items.isEmpty ? nil : TodaySection(pinId: section.pinId, pinTitle: section.pinTitle, items: items)
        }
    }

    var openCount: Int { visibleSections.reduce(0) { $0 + $1.items.count } }

    func toggleDone(_ item: TodayItem) {
        guard !checkedIDs.contains(item.id) else { return }
        SoundService.shared.tick()
        checkedIDs.insert(item.id)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 450_000_000)
            withAnimation(Theme.Motion.list) { _ = goneIDs.insert(item.id) }
        }
        Task { @MainActor in
            if await !ItemActions.shared.markDone(pinID: item.pinId, itemID: item.id) {
                checkedIDs.remove(item.id)
                withAnimation(Theme.Motion.list) { _ = goneIDs.remove(item.id) }
            }
        }
    }

    func snooze(_ item: TodayItem, _ option: SnoozeOption) {
        // Later today keeps the row (its time only moves); the others move it out of today.
        let leaves = option != .laterToday
        if leaves { withAnimation(Theme.Motion.list) { _ = goneIDs.insert(item.id) } }
        Task { @MainActor in
            if await !ItemActions.shared.snooze(item, option), leaves {
                withAnimation(Theme.Motion.list) { _ = goneIDs.remove(item.id) }
            }
        }
    }

    /// Forget ids that the summaries no longer contain.
    func prune() {
        let present = Set(digest.items.map(\.id))
        checkedIDs.formIntersection(present)
        goneIDs.formIntersection(present)
    }
}
