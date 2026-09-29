import Foundation

/// Simple per-pin JSON file cache for rows or blocks, so a panel can render instantly before refreshing.
public struct Cache: Sendable {
    private let directory: URL

    public init(directory: URL = AppStorageLocation.cacheDirectory) {
        self.directory = directory
    }

    public func save<T: Encodable>(_ value: T, forPin pinId: String, kind: String) {
        let url = fileURL(pinId: pinId, kind: kind)
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: url, options: .atomic)
    }

    public func load<T: Decodable>(_ type: T.Type, forPin pinId: String, kind: String) -> T? {
        let url = fileURL(pinId: pinId, kind: kind)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    public func clear(forPin pinId: String, kind: String) {
        try? FileManager.default.removeItem(at: fileURL(pinId: pinId, kind: kind))
    }

    private func fileURL(pinId: String, kind: String) -> URL {
        directory.appendingPathComponent("\(pinId)-\(kind).json")
    }
}

public extension Cache {
    func saveRows(_ rows: [Row], forPin pinId: String) { save(rows, forPin: pinId, kind: "rows") }
    func loadRows(forPin pinId: String) -> [Row]? { load([Row].self, forPin: pinId, kind: "rows") }
    func saveBlocks(_ blocks: [Block], forPin pinId: String) { save(blocks, forPin: pinId, kind: "blocks") }
    func loadBlocks(forPin pinId: String) -> [Block]? { load([Block].self, forPin: pinId, kind: "blocks") }
}
