import AppKit

// main.swift's top level runs on the main thread but isn't statically known to Swift concurrency
// as @MainActor-isolated; assumeIsolated documents that guarantee for the MainActor-isolated types below.
MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.run()
}
