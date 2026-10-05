import Testing
import Foundation
@testable import NotionKit

@Suite("PageBackup")
struct PageBackupTests {
    private func tempDir() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("brink-backup-\(UUID().uuidString)")
    }

    private let blocks = [
        SyncedParagraph(blockID: "a", kind: .heading1, content: "Title"),
        SyncedParagraph(blockID: "b", kind: .bulleted, content: "one"),
        SyncedParagraph(blockID: "c", parentID: "b", kind: .toDo(checked: true), content: "nested"),
    ]

    @Test("writes markdown named by page id and timestamp")
    func writes() throws {
        let dir = tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let url = try #require(PageBackup.write(pageID: "page-1", blocks: blocks, directory: dir))
        #expect(url.lastPathComponent.hasPrefix("page-1-"))
        #expect(url.pathExtension == "md")
        let text = try String(contentsOf: url, encoding: .utf8)
        #expect(text == "# Title\n- one\n  - [x] nested\n")
    }

    @Test("keeps only the newest 20 per page and leaves other pages alone")
    func prunes() throws {
        let dir = tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        for i in 0..<25 {
            PageBackup.write(pageID: "page-1", blocks: blocks, now: Date(timeIntervalSince1970: 1_800_000_000 + Double(i)), directory: dir)
        }
        PageBackup.write(pageID: "page-2", blocks: blocks, directory: dir)
        let names = try FileManager.default.contentsOfDirectory(atPath: dir.path)
        #expect(names.filter { $0.hasPrefix("page-1-") }.count == 20)
        #expect(names.filter { $0.hasPrefix("page-2-") }.count == 1)
        #expect(!names.contains { $0.hasPrefix("page-1-") && $0 < "page-1-2027-01-15T08-00-05" })
    }

    @Test("a failing write is swallowed")
    func failureIsSilent() throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("brink-notadir-\(UUID().uuidString)")
        try Data().write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }
        #expect(PageBackup.write(pageID: "p", blocks: blocks, directory: file.appendingPathComponent("sub")) == nil)
    }
}
