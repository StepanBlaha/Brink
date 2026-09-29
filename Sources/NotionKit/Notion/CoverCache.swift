import Foundation
import os

/// On-disk cache of page cover images under Application Support/NotionDock/cache/covers.
/// Keyed by the URL without its query string, so a re-signed Notion file URL maps to the same
/// file. Notion-hosted URLs expire: on 403 the caller's `refresh` supplies a fresh URL.
public actor CoverCache {
    public static let shared = CoverCache()

    private let directory: URL
    private let session: URLSession
    private static let log = Logger(subsystem: "cz.stepanblaha.notiondock", category: "cover")

    public init(directory: URL? = nil, session: URLSession = .shared) {
        let dir = directory ?? AppStorageLocation.cacheDirectory.appendingPathComponent("covers", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        self.directory = dir
        self.session = session
    }

    public static func key(for url: URL) -> String {
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        components?.query = nil
        components?.fragment = nil
        let base = components?.string ?? url.absoluteString
        // Stable, filesystem-safe name (FNV-1a 64).
        var hash: UInt64 = 0xcbf29ce484222325
        for byte in base.utf8 { hash = (hash ^ UInt64(byte)) &* 0x100000001b3 }
        return String(hash, radix: 16)
    }

    public func fileURL(for url: URL) -> URL {
        directory.appendingPathComponent(Self.key(for: url))
    }

    /// Cached bytes, or downloads them. On 403 (expired signed URL) asks `refresh` once for a
    /// fresh URL and retries.
    public func imageData(for url: URL, refresh: @Sendable () async -> URL?) async -> Data? {
        let file = fileURL(for: url)
        if let data = try? Data(contentsOf: file), !data.isEmpty { return data }
        switch await download(url) {
        case .ok(let data):
            try? data.write(to: file, options: .atomic)
            return data
        case .expired:
            Self.log.info("cover URL expired; refetching page for a fresh one")
            guard let fresh = await refresh(), case .ok(let data) = await download(fresh) else { return nil }
            try? data.write(to: fileURL(for: fresh), options: .atomic)
            return data
        case .failed:
            return nil
        }
    }

    private enum Result { case ok(Data), expired, failed }

    private func download(_ url: URL) async -> Result {
        do {
            let (data, response) = try await session.data(from: url)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 200
            if status == 403 { return .expired }
            guard (200..<300).contains(status), !data.isEmpty else { return .failed }
            return .ok(data)
        } catch {
            Self.log.error("cover download failed: \(error.localizedDescription, privacy: .public)")
            return .failed
        }
    }
}
