import Foundation
import Observation
import NotionKit

/// Drives a single database's task list: loading/caching rows, polling, and optimistic
/// checkbox/status/date/title edits queued through `WriteQueue`.
@MainActor
@Observable
final class DatabaseViewModel {
    private(set) var rows: [Row] = []
    private(set) var isLoading = false
    var errorMessage: String?
    private(set) var schema: DataSourceSchema?

    /// Whether this database view is read-only (no checkbox/status property to mark done).
    var isReadOnly: Bool { config == nil }

    var showDone: Bool {
        didSet {
            guard oldValue != showDone else { return }
            Task { await self.load(showLoading: true) }
        }
    }

    /// The status property name to show as a trailing pill, only when the done property is a
    /// checkbox and a separate status property exists on the schema.
    var statusPropertyName: String? {
        guard config?.doneKind == .checkbox, let schema else { return nil }
        return schema.properties.first { $0.type == "status" }?.name
    }

    let dataSourceId: String
    private(set) var config: DatabaseConfig?
    private let cacheKey: String
    private let client: NotionClient
    private let cache: Cache
    private let writeQueue: WriteQueue

    private var pollTask: Task<Void, Never>?
    private var animatingOutIds: Set<String> = []

    /// For pinned databases: the done/date property mapping is already known.
    init(dataSourceId: String, config: DatabaseConfig, cacheKey: String, client: NotionClient, cache: Cache, writeQueue: WriteQueue) {
        self.dataSourceId = dataSourceId
        self.config = config
        self.cacheKey = cacheKey
        self.client = client
        self.cache = cache
        self.writeQueue = writeQueue
        self.showDone = config.showDone
    }

    private init(dataSourceId: String, config: DatabaseConfig?, cacheKey: String, client: NotionClient, cache: Cache, writeQueue: WriteQueue, schema: DataSourceSchema?) {
        self.dataSourceId = dataSourceId
        self.config = config
        self.cacheKey = cacheKey
        self.client = client
        self.cache = cache
        self.writeQueue = writeQueue
        self.showDone = config?.showDone ?? false
        self.schema = schema
    }

    /// For a database embedded inside a page (a `child_database` block): resolves the block id to
    /// its data source, then auto-infers a view config from the schema.
    /// - done: the first checkbox property, else a status property whose option is in a "Complete"
    ///   group or named Done/Completed/Hotovo.
    /// - date: the first date property.
    /// - If neither a checkbox nor a status property exists, the view is read-only (no config).
    static func embedded(childDatabaseId: String, client: NotionClient, cache: Cache, writeQueue: WriteQueue) async throws -> DatabaseViewModel {
        let dataSources = try await client.retrieveDatabase(childDatabaseId)
        guard let first = dataSources.first else {
            throw NotionError.decoding("Database \(childDatabaseId) has no data sources")
        }
        let schema = try await client.retrieveDataSource(first.id)
        let config = inferConfig(from: schema)
        return DatabaseViewModel(
            dataSourceId: first.id,
            config: config,
            cacheKey: "embedded-\(first.id)",
            client: client,
            cache: cache,
            writeQueue: writeQueue,
            schema: schema
        )
    }

    static func inferConfig(from schema: DataSourceSchema) -> DatabaseConfig? {
        let dateName = schema.properties.first { $0.type == "date" }?.name
        if let checkbox = schema.properties.first(where: { $0.type == "checkbox" }) {
            return DatabaseConfig(doneProperty: checkbox.name, doneKind: .checkbox, dateProperty: dateName, showDone: false)
        }
        if let status = schema.properties.first(where: { $0.type == "status" }) {
            let doneValue = status.doneStatusOptionNames.first
            return DatabaseConfig(doneProperty: status.name, doneKind: .status, doneValue: doneValue, dateProperty: dateName, showDone: false)
        }
        return nil
    }

    // MARK: - Loading

    func load() async {
        await load(showLoading: true)
    }

    private func load(showLoading: Bool) async {
        if rows.isEmpty, let cached = cache.loadRows(forPin: cacheKey) {
            rows = cached
        }
        if showLoading, rows.isEmpty {
            isLoading = true
        }
        do {
            if schema == nil {
                schema = try? await client.retrieveDataSource(dataSourceId)
            }
            let fetched = try await client.queryDataSource(dataSourceId, filter: buildFilter(), sorts: buildSorts())
            rows = fetched
            cache.saveRows(fetched, forPin: cacheKey)
            errorMessage = nil
        } catch NotionError.notFound {
            errorMessage = "Database not found. Share it with your integration in Notion."
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func buildFilter() -> JSONValue? {
        var parts: [JSONValue] = []
        if let config, !showDone {
            switch config.doneKind {
            case .checkbox:
                parts.append(.object(["property": .string(config.doneProperty), "checkbox": .object(["equals": .bool(false)])]))
            case .status:
                if let doneValue = config.doneValue {
                    parts.append(.object(["property": .string(config.doneProperty), "status": .object(["does_not_equal": .string(doneValue)])]))
                }
            }
        }
        if let extraFilters = config?.filters, let extraJSON = ViewQueryBuilder.filterJSON(extraFilters) {
            parts.append(extraJSON)
        }
        if parts.isEmpty { return nil }
        if parts.count == 1 { return parts[0] }
        return .object(["and": .array(parts)])
    }

    private func buildSorts() -> JSONValue {
        if let sorts = config?.sorts, let json = ViewQueryBuilder.sortsJSON(sorts) {
            return json
        }
        if let dateProperty = config?.dateProperty {
            return .array([.object(["property": .string(dateProperty), "direction": .string("ascending")])])
        }
        return .array([.object(["timestamp": .string("created_time"), "direction": .string("descending")])])
    }

    // MARK: - Polling

    func startPolling() {
        stopPolling()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 45_000_000_000)
                if Task.isCancelled { return }
                await self?.load(showLoading: false)
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    // MARK: - Row state helpers

    func isDone(_ row: Row) -> Bool {
        guard let config else { return false }
        switch config.doneKind {
        case .checkbox:
            if case .checkbox(let value)? = row.properties[config.doneProperty] { return value }
            return false
        case .status:
            if case .status(let name)? = row.properties[config.doneProperty] { return name == config.doneValue }
            return false
        }
    }

    func isAnimatingOut(_ rowId: String) -> Bool {
        animatingOutIds.contains(rowId)
    }

    func statusName(_ row: Row) -> String? {
        guard let statusPropertyName else { return nil }
        if case .status(let name)? = row.properties[statusPropertyName] { return name }
        return nil
    }

    func date(_ row: Row) -> Date? {
        guard let dateProperty = config?.dateProperty else { return nil }
        if case .date(let start, _)? = row.properties[dateProperty] { return start.flatMap(Self.parseDate) }
        return nil
    }

    // MARK: - Actions

    func toggleDone(_ rowId: String) async {
        guard let config, let index = rows.firstIndex(where: { $0.id == rowId }) else { return }
        let row = rows[index]
        let currentlyDone = isDone(row)
        let newValue: PropertyValue
        switch config.doneKind {
        case .checkbox:
            newValue = .checkbox(!currentlyDone)
        case .status:
            newValue = .status(name: currentlyDone ? firstNonDoneStatusOption() : config.doneValue)
        }

        if !currentlyDone { SoundService.shared.tick() }
        let previousRows = rows
        rows[index] = row.replacing(property: config.doneProperty, with: newValue)

        if !currentlyDone, !showDone {
            scheduleAnimateOut(rowId: rowId)
        } else {
            animatingOutIds.remove(rowId)
        }

        let update = PropertyUpdate(name: config.doneProperty, value: newValue)
        await performWrite(.toggleDone(pageId: rowId, update: update)) {
            self.rows = previousRows
            self.animatingOutIds.remove(rowId)
        }
    }

    func quickAdd(_ title: String) async {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let tempId = "temp-\(UUID().uuidString)"
        rows.insert(Row(id: tempId, url: nil, icon: .none, title: trimmed, properties: [:]), at: 0)

        let op = PendingWrite.Operation.createRow(dataSourceId: dataSourceId, title: trimmed, extra: [])
        switch await writeQueue.submit(op, using: client) {
        case .failed(let message):
            errorMessage = message
            rows.removeAll { $0.id == tempId }
        case .queued(let message):
            errorMessage = "Not synced yet: \(message)"
        case .saved:
            errorMessage = nil
            await load(showLoading: false)
        }
    }

    func rename(_ rowId: String, title: String) async {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let index = rows.firstIndex(where: { $0.id == rowId }) else { return }
        guard let titleProperty = titlePropertyName() else { return }
        guard rows[index].title != trimmed else { return }

        let previousRows = rows
        rows[index] = rows[index].replacing(property: titleProperty, with: .title(trimmed), title: trimmed)

        let update = PropertyUpdate(name: titleProperty, value: .title(trimmed))
        await performWrite(.updateProperty(pageId: rowId, updates: [update])) {
            self.rows = previousRows
        }
    }

    /// Whether the row's current date value carries a time of day.
    func dateHasTime(_ row: Row) -> Bool {
        guard let dateProperty = config?.dateProperty, case .date(let start?, _)? = row.properties[dateProperty] else { return false }
        return start.contains("T")
    }

    func snooze(_ rowId: String, _ option: SnoozeOption) async {
        guard config?.dateProperty != nil, let row = rows.first(where: { $0.id == rowId }) else { return }
        let hasTime = dateHasTime(row)
        if option == .laterToday, !hasTime { return }
        let target = SnoozeCalculator.target(option, current: date(row), currentHasTime: hasTime)
        await setDate(rowId, date: target.date, hasTime: target.hasTime)
    }

    func setDate(_ rowId: String, date: Date?, hasTime: Bool = false) async {
        guard let dateProperty = config?.dateProperty, let index = rows.firstIndex(where: { $0.id == rowId }) else { return }
        let iso = date.map { NaturalDate.isoString($0, hasTime: hasTime) }
        let previousRows = rows
        rows[index] = rows[index].replacing(property: dateProperty, with: .date(start: iso, end: nil))

        let update = PropertyUpdate(name: dateProperty, value: .date(start: iso, end: nil))
        await performWrite(.updateProperty(pageId: rowId, updates: [update])) {
            self.rows = previousRows
        }
    }

    func setStatus(_ rowId: String, option: String) async {
        guard let statusPropertyName, let index = rows.firstIndex(where: { $0.id == rowId }) else { return }
        let previousRows = rows
        rows[index] = rows[index].replacing(property: statusPropertyName, with: .status(name: option))

        let update = PropertyUpdate(name: statusPropertyName, value: .status(name: option))
        await performWrite(.updateProperty(pageId: rowId, updates: [update])) {
            self.rows = previousRows
        }
    }

    // MARK: - Write queue plumbing

    private func performWrite(_ operation: PendingWrite.Operation, rollback: @escaping () -> Void) async {
        switch await writeQueue.submit(operation, using: client) {
        case .saved:
            errorMessage = nil
        case .queued(let message):
            errorMessage = "Not synced yet: \(message)"
        case .failed(let message):
            errorMessage = message
            rollback()
        }
    }

    private func firstNonDoneStatusOption() -> String? {
        guard let config, let schema else { return nil }
        guard let statusSchema = schema.properties.first(where: { $0.name == config.doneProperty && $0.type == "status" }) else { return nil }
        let doneNames = Set(statusSchema.doneStatusOptionNames)
        return statusSchema.statusOptions?.first(where: { !doneNames.contains($0.name) })?.name
    }

    private func titlePropertyName() -> String? {
        schema?.properties.first { $0.type == "title" }?.name
    }

    private func scheduleAnimateOut(rowId: String) {
        animatingOutIds.insert(rowId)
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 800_000_000)
            guard let self else { return }
            self.animatingOutIds.remove(rowId)
            guard !self.showDone else { return }
            self.rows.removeAll { $0.id == rowId }
        }
    }

    // MARK: - Date formatting

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        formatter.timeZone = .current
        return formatter
    }()

    private static let isoDateTimeFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let isoFractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static func formatDate(_ date: Date) -> String {
        isoFormatter.string(from: date)
    }

    static func parseDate(_ string: String) -> Date? {
        if string.contains("T") {
            return isoDateTimeFormatter.date(from: string) ?? isoFractionalFormatter.date(from: string)
        }
        return isoFormatter.date(from: string)
    }
}

private extension Row {
    /// Returns a copy with a single property replaced (and, optionally, the display title updated).
    func replacing(property name: String, with value: PropertyValue, title newTitle: String? = nil) -> Row {
        var properties = self.properties
        properties[name] = value
        return Row(id: id, url: url, icon: icon, title: newTitle ?? title, properties: properties)
    }
}
