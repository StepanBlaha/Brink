import XCTest
@testable import NotionKit

final class BrandingTests: XCTestCase {
    private var repoRoot: URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    func testParsesVersionFile() {
        XCTAssertEqual(AppVersion(parsing: "0.9.0 (1)\n"), AppVersion(marketing: "0.9.0", build: "1"))
        XCTAssertEqual(AppVersion(parsing: "1.2 (42)")?.display, "1.2 (42)")
        XCTAssertEqual(AppVersion(parsing: "2.0.1")?.build, "1")
        XCTAssertNil(AppVersion(parsing: ""))
        XCTAssertNil(AppVersion(parsing: "abc (1)"))
        XCTAssertNil(AppVersion(parsing: "1.0 (x)"))
        XCTAssertNil(AppVersion(parsing: "1..0 (1)"))
    }

    func testVersionFileMatchesProjectYml() throws {
        let file = try String(contentsOf: repoRoot.appendingPathComponent("VERSION"), encoding: .utf8)
        let version = try XCTUnwrap(AppVersion(parsing: file))
        let yml = try String(contentsOf: repoRoot.appendingPathComponent("project.yml"), encoding: .utf8)
        XCTAssertTrue(yml.contains("MARKETING_VERSION: \(version.marketing)"), "project.yml MARKETING_VERSION differs from VERSION")
        XCTAssertTrue(yml.contains("CURRENT_PROJECT_VERSION: \"\(version.build)\""), "project.yml CURRENT_PROJECT_VERSION differs from VERSION")
    }

    func testNoSourceUsesTheOldProductName() throws {
        let sources = repoRoot.appendingPathComponent("Sources")
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: sources, includingPropertiesForKeys: nil,
                                                                      options: [.skipsHiddenFiles]))
        var offenders: [String] = []
        for case let url as URL in enumerator where url.pathExtension == "swift" || url.pathExtension == "plist" {
            let text = try String(contentsOf: url, encoding: .utf8)
            if text.range(of: "Notion Dock", options: .caseInsensitive) != nil { offenders.append(url.lastPathComponent) }
        }
        XCTAssertTrue(offenders.isEmpty, "User-visible \"Notion Dock\" found in: \(offenders)")
    }
}
