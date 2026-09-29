// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "NotionDock",
    platforms: [.macOS(.v14)],
    targets: [
        .target(name: "NotionKit", path: "Sources/NotionKit"),
        .executableTarget(name: "NotionDock", dependencies: ["NotionKit"], path: "Sources/NotionDock"),
        .testTarget(name: "NotionKitTests", dependencies: ["NotionKit"], path: "Tests/NotionKitTests"),
    ],
    swiftLanguageModes: [.v5]
)
