import Foundation
import os

/// A local safety copy of a page's last confirmed content, written right before a sync that
/// deletes blocks. Lives under Application Support/NotionDock/backups, newest 20 per page.
/// Best effort only: a failure is logged and never blocks or fails the save.
public enum PageBackup {
    public static let maxPerPage = 20
    private static let log = Logger(subsystem: "cz.stepanblaha.notiondock", category: "backup")

    public static var directory: URL {
        AppStorageLocation.applicationSupportDirectory.appendingPathComponent("backups", isDirectory: true)
    }

    /// Writes `blocks` as Markdown to `<dir>/<pageID>-<ISO timestamp>.md` and prunes old copies.
    /// Returns the file written, or nil if there was nothing to save or writing failed.
    @discardableResult
    public static func write(pageID: String, blocks: [SyncedParagraph], now: Date = Date(), directory: URL? = nil) -> URL? {
        guard !blocks.isEmpty else { return nil }
        let dir = directory ?? Self.directory
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let stamp = ISO8601DateFormatter.backupStamp.string(from: now).replacingOccurrences(of: ":", with: "-")
            let url = dir.appendingPathComponent("\(pageID)-\(stamp).md")
            try markdown(for: blocks).write(to: url, atomically: true, encoding: .utf8)
            prune(pageID: pageID, in: dir)
            log.info("backup written for page \(pageID, privacy: .public): \(blocks.count) blocks")
            return url
        } catch {
            log.error("backup failed for page \(pageID, privacy: .public): \(String(describing: error), privacy: .public)")
            return nil
        }
    }

    /// Keeps the newest `maxPerPage` backups of one page (names sort by their timestamp).
    static func prune(pageID: String, in dir: URL) {
        let names = ((try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? [])
            .filter { $0.hasPrefix(pageID + "-") && $0.hasSuffix(".md") }
            .sorted()
        for name in names.dropLast(maxPerPage) {
            try? FileManager.default.removeItem(at: dir.appendingPathComponent(name))
        }
    }

    static func markdown(for blocks: [SyncedParagraph]) -> String {
        var depth: [String: Int] = [:]
        var number: [String: Int] = [:] // running 1. 2. 3. count per parent
        var lines: [String] = []
        for block in blocks {
            let level = block.parentID.flatMap { depth[$0] }.map { $0 + 1 } ?? 0
            depth[block.blockID] = level
            let key = block.parentID ?? ""
            if case .numbered = block.kind { number[key, default: 0] += 1 } else { number[key] = 0 }
            let text = MarkdownSerializer.markdown(from: block.spans)
            let indent = String(repeating: "  ", count: level)
            lines.append(indent + line(kind: block.kind, text: text, number: number[key] ?? 0))
        }
        return lines.joined(separator: "\n") + "\n"
    }

    private static func line(kind: ParagraphKind, text: String, number: Int) -> String {
        switch kind {
        case .paragraph, .toggle: return text
        case .heading1: return "# " + text
        case .heading2: return "## " + text
        case .heading3: return "### " + text
        case .bulleted: return "- " + text
        case .numbered: return "\(number). " + text
        case .toDo(let checked): return (checked ? "- [x] " : "- [ ] ") + text
        case .quote: return "> " + text
        case .code(let language): return "```\(language)\n\(text)\n```"
        case .divider: return "---"
        case .callout(let icon): return "> \(icon) " + text
        case .token(let type, let title): return "[\(type): \(title)]"
        case .image(let source): return "[image: \(source)]"
        }
    }
}

private extension ISO8601DateFormatter {
    static let backupStamp: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
