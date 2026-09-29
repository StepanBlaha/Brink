import Foundation
import Observation

public struct PendingWrite: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let operation: Operation
    public let createdAt: Date

    public init(id: String = UUID().uuidString, operation: Operation, createdAt: Date = Date()) {
        self.id = id
        self.operation = operation
        self.createdAt = createdAt
    }

    public enum Operation: Sendable, Equatable {
        case toggleDone(pageId: String, update: PropertyUpdate)
        case createRow(dataSourceId: String, title: String, extra: [PropertyUpdate])
        case updateProperty(pageId: String, updates: [PropertyUpdate])
        case updateBlock(blockId: String, type: String, update: BlockUpdate)
        case appendBlock(parentId: String, block: NewBlock)
        /// Additive: appends several blocks as one API call (one append gesture from the Markdown
        /// composer becomes one queued write instead of N), optionally positioned after a sibling.
        case appendBlocks(parentId: String, blocks: [NewBlock], position: BlockPosition = .end)
        /// Additive: used by block-type conversion (e.g. typing "# " at the start of a paragraph)
        /// to remove the old block once its replacement has been appended.
        case deleteBlock(blockId: String)
    }
}

extension PendingWrite.Operation: Codable {
    private enum Kind: String, Codable {
        case toggleDone, createRow, updateProperty, updateBlock, appendBlock, appendBlocks, deleteBlock
    }
    private enum CodingKeys: String, CodingKey {
        case kind, pageId, update, dataSourceId, title, extra, updates, blockId, type, parentId, block, blocks, position
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Kind.self, forKey: .kind) {
        case .toggleDone:
            self = .toggleDone(
                pageId: try container.decode(String.self, forKey: .pageId),
                update: try container.decode(PropertyUpdate.self, forKey: .update)
            )
        case .createRow:
            self = .createRow(
                dataSourceId: try container.decode(String.self, forKey: .dataSourceId),
                title: try container.decode(String.self, forKey: .title),
                extra: try container.decodeIfPresent([PropertyUpdate].self, forKey: .extra) ?? []
            )
        case .updateProperty:
            self = .updateProperty(
                pageId: try container.decode(String.self, forKey: .pageId),
                updates: try container.decode([PropertyUpdate].self, forKey: .updates)
            )
        case .updateBlock:
            self = .updateBlock(
                blockId: try container.decode(String.self, forKey: .blockId),
                type: try container.decode(String.self, forKey: .type),
                update: try container.decode(BlockUpdate.self, forKey: .update)
            )
        case .appendBlock:
            self = .appendBlock(
                parentId: try container.decode(String.self, forKey: .parentId),
                block: try container.decode(NewBlock.self, forKey: .block)
            )
        case .appendBlocks:
            self = .appendBlocks(
                parentId: try container.decode(String.self, forKey: .parentId),
                blocks: try container.decode([NewBlock].self, forKey: .blocks),
                position: try container.decodeIfPresent(BlockPosition.self, forKey: .position) ?? .end
            )
        case .deleteBlock:
            self = .deleteBlock(blockId: try container.decode(String.self, forKey: .blockId))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .toggleDone(let pageId, let update):
            try container.encode(Kind.toggleDone, forKey: .kind)
            try container.encode(pageId, forKey: .pageId)
            try container.encode(update, forKey: .update)
        case .createRow(let dataSourceId, let title, let extra):
            try container.encode(Kind.createRow, forKey: .kind)
            try container.encode(dataSourceId, forKey: .dataSourceId)
            try container.encode(title, forKey: .title)
            try container.encode(extra, forKey: .extra)
        case .updateProperty(let pageId, let updates):
            try container.encode(Kind.updateProperty, forKey: .kind)
            try container.encode(pageId, forKey: .pageId)
            try container.encode(updates, forKey: .updates)
        case .updateBlock(let blockId, let type, let update):
            try container.encode(Kind.updateBlock, forKey: .kind)
            try container.encode(blockId, forKey: .blockId)
            try container.encode(type, forKey: .type)
            try container.encode(update, forKey: .update)
        case .appendBlock(let parentId, let block):
            try container.encode(Kind.appendBlock, forKey: .kind)
            try container.encode(parentId, forKey: .parentId)
            try container.encode(block, forKey: .block)
        case .appendBlocks(let parentId, let blocks, let position):
            try container.encode(Kind.appendBlocks, forKey: .kind)
            try container.encode(parentId, forKey: .parentId)
            try container.encode(blocks, forKey: .blocks)
            try container.encode(position, forKey: .position)
        case .deleteBlock(let blockId):
            try container.encode(Kind.deleteBlock, forKey: .kind)
            try container.encode(blockId, forKey: .blockId)
        }
    }
}

/// A persisted FIFO queue of writes pending against the Notion API. Survives app restart;
/// `process(using:)` replays them in order, removing each on success and stopping (with `lastError` set) on failure.
@MainActor
@Observable
public final class WriteQueue {
    public private(set) var pending: [PendingWrite] = []
    public private(set) var lastError: String?
    private let fileURL: URL

    public init(fileURL: URL = AppStorageLocation.pendingWritesFile) {
        self.fileURL = fileURL
        load()
    }

    public func enqueue(_ operation: PendingWrite.Operation) {
        pending.append(PendingWrite(operation: operation))
        save()
    }

    public enum Outcome: Equatable, Sendable {
        case saved
        /// Transient failure (network, rate limit, auth); the write stays queued for retry.
        case queued(String)
        /// Notion rejected the write; it was dropped and the caller should roll back.
        case failed(String)
    }

    private var drainTask: Task<Void, Never>?
    private var outcomes: [String: Outcome] = [:]

    /// Enqueues a write, drains the queue, and reports what happened to this write.
    public func submit(_ operation: PendingWrite.Operation, using client: NotionClient) async -> Outcome {
        await submit(operation, using: client, retainOnTransientFailure: true)
    }

    /// Additive: like `submit`, but with `retainOnTransientFailure: false` a write that couldn't
    /// be sent (transient failure, or stuck behind one) is withdrawn from the queue instead of
    /// staying persisted — for callers that re-derive and retry the write themselves (the page
    /// editor re-plans from its last confirmed state, so a kept copy would be a duplicate).
    public func submit(_ operation: PendingWrite.Operation, using client: NotionClient, retainOnTransientFailure: Bool) async -> Outcome {
        let write = PendingWrite(operation: operation)
        pending.append(write)
        save()
        await process(using: client)
        let outcome = outcomes.removeValue(forKey: write.id) ?? .queued(lastError ?? "Waiting to sync.")
        if case .queued = outcome, !retainOnTransientFailure { withdraw(write.id) }
        return outcome
    }

    private func withdraw(_ id: String) {
        guard pending.contains(where: { $0.id == id }) else { return }
        pending.removeAll { $0.id == id }
        save()
    }

    /// Drains pending writes in order. Concurrent callers share a single in-flight drain.
    public func process(using client: NotionClient) async {
        if let running = drainTask {
            await running.value
        }
        if let running = drainTask {
            await running.value
            return
        }
        guard !pending.isEmpty else { return }
        let task = Task { await drain(using: client) }
        drainTask = task
        await task.value
        drainTask = nil
    }

    private func drain(using client: NotionClient) async {
        while let write = pending.first {
            do {
                try await execute(write.operation, using: client)
                finish(write, .saved)
            } catch let error as NotionError where error.isTransient {
                lastError = error.localizedDescription
                outcomes[write.id] = .queued(error.localizedDescription)
                return
            } catch {
                finish(write, .failed(error.localizedDescription))
            }
        }
        lastError = nil
    }

    private func finish(_ write: PendingWrite, _ outcome: Outcome) {
        pending.removeAll { $0.id == write.id }
        outcomes[write.id] = outcome
        save()
    }

    private func execute(_ operation: PendingWrite.Operation, using client: NotionClient) async throws {
        switch operation {
        case .toggleDone(let pageId, let update):
            try await client.updatePageProperties(pageId: pageId, [update])
        case .createRow(let dataSourceId, let title, let extra):
            try await client.createRow(dataSourceId: dataSourceId, title: title, extra: extra)
        case .updateProperty(let pageId, let updates):
            try await client.updatePageProperties(pageId: pageId, updates)
        case .updateBlock(let blockId, let type, let update):
            try await client.updateBlock(blockId, type: type, update: update)
        case .appendBlock(let parentId, let block):
            try await client.appendBlocks(parentId: parentId, [block])
        case .appendBlocks(let parentId, let blocks, let position):
            try await client.appendBlocks(parentId: parentId, blocks, position: position)
        case .deleteBlock(let blockId):
            try await client.deleteBlock(blockId)
        }
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        pending = (try? JSONDecoder().decode([PendingWrite].self, from: data)) ?? []
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(pending) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
