import Foundation

/// One request an extension hands to the main app.
public enum InboxAction: Codable, Equatable, Sendable {
    /// Set a to-do block / database row's done state.
    case toggle(pinId: String, itemId: String, kind: WidgetSnapshot.ItemKind, checked: Bool)
    /// Save text (and an optional URL) to a pin; `nil` pin = the last quick-capture destination.
    case capture(text: String, url: String?, pinId: String?)
}

public struct InboxEntry: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var createdAt: Date
    public var action: InboxAction

    public init(id: String = UUID().uuidString, createdAt: Date = Date(), action: InboxAction) {
        self.id = id
        self.createdAt = createdAt
        self.action = action
    }
}

/// Append-only JSON-lines queue in the App Group container. Extensions append; the main app
/// reads, applies and then removes exactly the entries it processed (so lines appended in the
/// meantime survive). All file access is coordinated across processes.
public struct SharedInbox: Sendable {
    public let url: URL

    public init(url: URL) { self.url = url }

    /// `nil` when the app group container is unavailable.
    public static var shared: SharedInbox? { SharedContainer.inboxURL.map(SharedInbox.init(url:)) }

    // MARK: - Line codec

    public static func encodeLine(_ entry: InboxEntry) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        var data = try encoder.encode(entry)
        data.append(0x0A)
        return data
    }

    /// Decodes every valid line; malformed lines are skipped.
    public static func decodeLines(_ data: Data) -> [InboxEntry] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return data.split(separator: 0x0A).compactMap { try? decoder.decode(InboxEntry.self, from: Data($0)) }
    }

    // MARK: - File operations

    @discardableResult
    public func append(_ action: InboxAction) throws -> InboxEntry {
        let entry = InboxEntry(action: action)
        let line = try Self.encodeLine(entry)
        try coordinate(writing: true) { url in
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            if FileManager.default.fileExists(atPath: url.path) {
                let handle = try FileHandle(forWritingTo: url)
                defer { try? handle.close() }
                try handle.seekToEnd()
                try handle.write(contentsOf: line)
            } else {
                try line.write(to: url)
            }
        }
        return entry
    }

    public func readAll() -> [InboxEntry] {
        var result: [InboxEntry] = []
        try? coordinate(writing: false) { url in
            if let data = try? Data(contentsOf: url) { result = Self.decodeLines(data) }
        }
        return result
    }

    /// Rewrites the file without the given entries.
    public func remove(ids: Set<String>) throws {
        guard !ids.isEmpty else { return }
        try coordinate(writing: true) { url in
            guard let data = try? Data(contentsOf: url) else { return }
            let kept = Self.decodeLines(data).filter { !ids.contains($0.id) }
            var out = Data()
            for entry in kept { out.append(try Self.encodeLine(entry)) }
            try out.write(to: url, options: .atomic)
        }
    }

    /// Reads everything, hands it to `apply`, and removes the entries `apply` returns as handled.
    public func drain(_ apply: ([InboxEntry]) -> Set<String>) throws {
        let entries = readAll()
        guard !entries.isEmpty else { return }
        try remove(ids: apply(entries))
    }

    private func coordinate(writing: Bool, _ body: (URL) throws -> Void) throws {
        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordError: NSError?
        var bodyError: Error?
        if writing {
            coordinator.coordinate(writingItemAt: url, options: .forMerging, error: &coordError) { u in
                do { try body(u) } catch { bodyError = error }
            }
        } else {
            coordinator.coordinate(readingItemAt: url, options: [], error: &coordError) { u in
                do { try body(u) } catch { bodyError = error }
            }
        }
        if let coordError { throw coordError }
        if let bodyError { throw bodyError }
    }
}
