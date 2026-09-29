import SwiftUI
import Observation
import NotionKit

struct MiniItem: Identifiable, Equatable {
    let id: String
    let title: String
}

/// Drives the menu-bar popover: expanded sections, lazily loaded open items per pin, optimistic
/// check-off and quick add. Writes go through the same paths as the panel (DatabaseViewModel for
/// database pins; NotionClient.updateBlock via WriteQueue for page pins).
@MainActor
@Observable
final class MiniListModel {
    let appModel: AppModel
    var expanded: Set<String> = []
    var selectedPinID: String?
    var query = ""
    private(set) var items: [String: [MiniItem]] = [:]
    private(set) var hidden: Set<String> = []
    private(set) var loading: Set<String> = []
    var message: String?

    @ObservationIgnored private var dbModels: [String: DatabaseViewModel] = [:]

    init(appModel: AppModel) {
        self.appModel = appModel
        selectedPinID = Settings.shared.lastOpenedPinID
    }

    var sections: [MiniListSection] {
        MiniList.sections(pins: appModel.pinStore.pins, summaries: PinSummaryService.shared.summaries,
                          groups: appModel.pinStore.groups, activeGroupID: Settings.shared.activeGroupID)
    }

    var targetPin: Pin? {
        let secs = sections
        let id = selectedPinID.flatMap { id in secs.contains { $0.pinID == id } ? id : nil } ?? secs.first?.pinID
        return appModel.pinStore.pins.first { $0.id == id }
    }

    func visibleItems(_ pinID: String) -> [MiniItem] {
        let q = query.trimmingCharacters(in: .whitespaces)
        return (items[pinID] ?? []).filter { !hidden.contains($0.id) && (q.isEmpty || $0.title.localizedCaseInsensitiveContains(q)) }
    }

    func openCount(_ section: MiniListSection) -> Int {
        max(0, section.openCount - hiddenCount(section.pinID))
    }

    private func hiddenCount(_ pinID: String) -> Int {
        (items[pinID] ?? []).filter { hidden.contains($0.id) }.count
    }

    func toggleExpanded(_ pinID: String) {
        selectedPinID = pinID
        if expanded.contains(pinID) { expanded.remove(pinID) } else {
            expanded.insert(pinID)
            Task { await load(pinID) }
        }
    }

    func load(_ pinID: String) async {
        guard let pin = appModel.pinStore.pins.first(where: { $0.id == pinID }), appModel.hasToken else { return }
        loading.insert(pinID)
        defer { loading.remove(pinID) }
        switch pin.kind {
        case .page:
            if items[pinID] == nil, let cached = appModel.cache.loadBlocks(forPin: pinID) { items[pinID] = Self.openTodos(cached) }
            if let blocks = try? await appModel.client.blockChildren(pin.notionId) {
                items[pinID] = Self.openTodos(blocks)
            }
        case .dataSource:
            let vm = databaseModel(for: pin)
            guard let vm else { return }
            await vm.load()
            items[pinID] = vm.rows.filter { !vm.isDone($0) }.map { MiniItem(id: $0.id, title: $0.title.isEmpty ? "Untitled" : $0.title) }
        }
    }

    private static func openTodos(_ blocks: [Block]) -> [MiniItem] {
        blocks.compactMap { block in
            guard case .toDo(let checked) = block.type, !checked else { return nil }
            let title = block.plainText.trimmingCharacters(in: .whitespacesAndNewlines)
            return MiniItem(id: block.id, title: title.isEmpty ? "Untitled" : title)
        }
    }

    private func databaseModel(for pin: Pin) -> DatabaseViewModel? {
        if let existing = dbModels[pin.id] { return existing }
        guard let config = pin.config else { return nil }
        let vm = DatabaseViewModel(dataSourceId: pin.notionId, config: config, cacheKey: pin.id, client: appModel.client, cache: appModel.cache, writeQueue: appModel.writeQueue)
        dbModels[pin.id] = vm
        return vm
    }

    // MARK: - Actions

    func check(_ item: MiniItem, in pin: Pin) {
        SoundService.shared.tick()
        withAnimation(Theme.Motion.contents) { _ = hidden.insert(item.id) }
        Task {
            var ok = true
            switch pin.kind {
            case .page:
                let outcome = await appModel.writeQueue.submit(.updateBlock(blockId: item.id, type: "to_do", update: .checked(true)), using: appModel.client)
                if case .failed(let text) = outcome { ok = false; message = text }
            case .dataSource:
                if let vm = databaseModel(for: pin) {
                    await vm.toggleDone(item.id)
                    if let row = vm.rows.first(where: { $0.id == item.id }), !vm.isDone(row) { ok = false; message = vm.errorMessage }
                }
            }
            if ok {
                items[pin.id]?.removeAll { $0.id == item.id }
                hidden.remove(item.id)
                NotificationCenter.default.post(name: .pinContentDidChange, object: pin.id)
            } else {
                withAnimation(Theme.Motion.contents) { _ = hidden.remove(item.id) }
            }
        }
    }

    func quickAdd() {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let pin = targetPin else { return }
        query = ""
        let temp = MiniItem(id: "temp-\(UUID().uuidString)", title: text)
        withAnimation(Theme.Motion.contents) { items[pin.id, default: []].append(temp) }
        expanded.insert(pin.id)
        Task {
            switch pin.kind {
            case .page:
                let outcome = await appModel.writeQueue.submit(.appendBlock(parentId: pin.notionId, block: .toDo(text, checked: false)), using: appModel.client)
                if case .failed(let text) = outcome {
                    message = text
                    items[pin.id]?.removeAll { $0.id == temp.id }
                    return
                }
            case .dataSource:
                await databaseModel(for: pin)?.quickAdd(text)
            }
            NotificationCenter.default.post(name: .pinContentDidChange, object: pin.id)
            await load(pin.id)
        }
    }
}
