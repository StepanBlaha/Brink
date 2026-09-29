import Foundation

public enum AppStorageLocation {
    public static var applicationSupportDirectory: URL {
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
