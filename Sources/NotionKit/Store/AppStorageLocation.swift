import Foundation

public enum AppStorageLocation {
    /// Demo mode only (`Features/Demo`): a throwaway folder used instead of the real one, so a
    /// scripted recording never touches the user's pins, cache or pending writes. Set once at
    /// launch, before any store is created.
    nonisolated(unsafe) public static var demoOverrideDirectory: URL?

    public static var applicationSupportDirectory: URL {
        if let demo = demoOverrideDirectory {
            try? FileManager.default.createDirectory(at: demo, withIntermediateDirectories: true)
            return demo
        }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("NotionDock", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    public static var cacheDirectory: URL {
        let dir = applicationSupportDirectory.appendingPathComponent("cache", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    public static var pinsFile: URL {
        applicationSupportDirectory.appendingPathComponent("pins.json")
    }

    public static var groupsFile: URL {
        applicationSupportDirectory.appendingPathComponent("groups.json")
    }

    public static var pendingWritesFile: URL {
        applicationSupportDirectory.appendingPathComponent("pending.json")
    }
}
