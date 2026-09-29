import Testing
import Foundation
@testable import NotionKit

@Suite("Capture", .serialized)
struct CaptureTests {
    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Prague")!
        return c
    }()
    static let now = calendar.date(from: DateComponents(year: 2026, month: 9, day: 29, hour: 10))!

    private let page = Pin(id: "p1", notionId: "page-1", kind: .page, title: "Inbox", icon: .none, order: 0)
    private let db = Pin(id: "p2", notionId: "ds-1", kind: .dataSource, title: "Buylist", icon: .none, order: 1,
                         config: DatabaseConfig(doneProperty: "Done", doneKind: .checkbox, dateProperty: "Due"))

    // MARK: clipboard -> blocks

    @Test("URL becomes a linked paragraph titled with the URL")
    func url() {
        let r = ClipboardMapper.map(.text("  https://example.com/a?b=1 \n"))
        let link = URL(string: "https://example.com/a?b=1")!
        #expect(r == .blocks([.formatted(.paragraph, richText: [RichTextSpan(text: "https://example.com/a?b=1", link: link)])]))
    }

    @Test("plain single line becomes a paragraph")
    func plain() {
        #expect(ClipboardMapper.map(.text("hello world")) == .blocks([.formatted(.paragraph, richText: [RichTextSpan(text: "hello world")])]))
    }

    @Test("text with a URL and words is a plain paragraph, not a link")
    func urlWithWords() {
        guard case .blocks(let blocks) = ClipboardMapper.map(.text("see https://example.com")) else { Issue.record("no blocks"); return }
        #expect(blocks == [.formatted(.paragraph, richText: [RichTextSpan(text: "see https://example.com")])])
    }

    @Test("multi-line text goes through the Markdown parser")
    func multiline() {
        guard case .blocks(let blocks) = ClipboardMapper.map(.text("# Title\n- one\n- two\n\nbody")) else { Issue.record("no blocks"); return }
        #expect(blocks == MarkdownParser.blocks(from: "# Title\n- one\n- two\n\nbody"))
        #expect(blocks.count == 4)
    }

    @Test("images and empty clipboard are unsupported")
    func unsupported() {
        #expect(ClipboardMapper.map(.image) == .unsupported("Images not supported yet"))
        #expect(ClipboardMapper.map(.empty) == .unsupported("Clipboard is empty"))
        #expect(ClipboardMapper.map(.text("  \n ")) == .unsupported("Clipboard is empty"))
    }

    // MARK: destination -> request shape

    @Test("page pin appends a to-do")
    func pageTodo() throws {
        let plan = try #require(CaptureRequest.plan(text: "call *mom*", pin: page, dateProperty: nil, now: Self.now, calendar: Self.calendar))
        #expect(plan.operation == .appendBlock(parentId: "page-1", block: .formatted(.toDo, richText: MarkdownParser.spans(from: "call *mom*"), checked: false)))
    }

    @Test("page pin honors a Markdown shortcut")
    func pageHeading() throws {
        let plan = try #require(CaptureRequest.plan(text: "# Ideas", pin: page, dateProperty: nil, now: Self.now, calendar: Self.calendar))
        #expect(plan.operation == .appendBlock(parentId: "page-1", block: .formatted(.heading1, richText: [RichTextSpan(text: "Ideas")])))
    }

    @Test("database pin creates a row and parses the date into the date property")
    func databaseRow() throws {
        let plan = try #require(CaptureRequest.plan(text: "Milk tomorrow 5pm", pin: db, dateProperty: "Due", now: Self.now, calendar: Self.calendar))
        #expect(plan.operation == .createRow(dataSourceId: "ds-1", title: "Milk", extra: [
            PropertyUpdate(name: "Due", value: .date(start: "2026-09-30T17:00:00+02:00", end: nil)),
        ]))
        #expect(plan.savedText == "Milk")
    }

    @Test("database without a date property keeps the whole text as title")
    func databaseNoDate() throws {
        let plan = try #require(CaptureRequest.plan(text: "Milk tomorrow", pin: db, dateProperty: nil, now: Self.now, calendar: Self.calendar))
        #expect(plan.operation == .createRow(dataSourceId: "ds-1", title: "Milk tomorrow", extra: []))
    }

    @Test("empty input yields no plan")
    func empty() {
        #expect(CaptureRequest.plan(text: "  ", pin: db, dateProperty: "Due") == nil)
    }

    // MARK: request on the wire

    @Test("database capture posts a page with title and date")
    @MainActor
    func wire() async throws {
        CaptureStubProtocol.reset()
        let client = NotionClient(tokenProvider: { "t" }, session: CaptureStubProtocol.session)
        let queue = WriteQueue(fileURL: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".json"))
        let plan = try #require(CaptureRequest.plan(text: "Milk tomorrow", pin: db, dateProperty: "Due", now: Self.now, calendar: Self.calendar))
        let outcome = await queue.submit(plan.operation, using: client)
        #expect(outcome == .saved)

        let body = try #require(CaptureStubProtocol.postBody)
        let parent = body["parent"] as? [String: Any]
        #expect(parent?["data_source_id"] as? String == "ds-1")
        let props = try #require(body["properties"] as? [String: Any])
        let due = (props["Due"] as? [String: Any])?["date"] as? [String: Any]
        #expect(due?["start"] as? String == "2026-09-30")
        let title = ((props["Name"] as? [String: Any])?["title"] as? [[String: Any]])?.first
        #expect((title?["text"] as? [String: Any])?["content"] as? String == "Milk")
    }
}

/// Private stub (the shared MockURLProtocol has global state other suites reset concurrently).
final class CaptureStubProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var postBody: [String: Any]?
    static func reset() { postBody = nil }
    static var session: URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CaptureStubProtocol.self]
        return URLSession(configuration: config)
    }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        var body = Data("{\"object\":\"page\",\"id\":\"new-1\",\"properties\":{}}".utf8)
        if request.httpMethod == "GET" {
            body = Data(DataSourceFixtures.schemaResponse.utf8)
        } else {
            var data = request.httpBody
            if data == nil, let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var buffer = Data(); var chunk = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable {
                    let n = stream.read(&chunk, maxLength: chunk.count)
                    if n <= 0 { break }
                    buffer.append(chunk, count: n)
                }
                data = buffer
            }
            Self.postBody = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [:])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
