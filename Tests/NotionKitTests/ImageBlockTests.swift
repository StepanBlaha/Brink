import Testing
import AppKit
@testable import NotionKit

/// Engine + fake-server image tests live in the (serialized) engine suite: FakeNotionServer's
/// state is global.
extension PageEditorEngineTests {
    private func makeImageEngine() -> PageEditorEngine {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("notiondock-tests-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let client = NotionClient(tokenProvider: { "test-token" }, session: FakeNotionServer.session)
        return PageEditorEngine(
            pageId: "page-1", client: client,
            writeQueue: WriteQueue(fileURL: dir.appendingPathComponent("pending.json")),
            cache: Cache(directory: dir), cacheKey: "pin-1",
            debounce: 30, remoteQuietPeriod: 0, retryInterval: 600,
            backupDirectory: dir.appendingPathComponent("backups")
        )
    }

    private func imageBlock(_ id: String) -> (id: String, type: String, text: String?, extra: [String: Any]) {
        (id: id, type: "image", text: nil, extra: ["type": "file", "file": ["url": "https://files.example/\(id).png?sig=1", "expiry_time": "2030-01-01T00:00:00.000Z"]])
    }

    private var png: Data { Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4]) }

    @Test("paste image → create upload → send multipart → append file_upload image after the caret's block")
    func uploadThenAppend() async throws {
        FakeNotionServer.reset()
        FakeNotionServer.seed(parent: "page-1", [
            (id: "p1", type: "paragraph", text: "Hello", extra: [:]),
            (id: "p2", type: "paragraph", text: "World", extra: [:]),
        ])
        let engine = makeImageEngine()
        await engine.load()
        FakeNotionServer.clearLog()

        let ok = await engine.insertImage(data: png, filename: "shot.png", contentType: "image/png", afterParagraphAt: 0)
        #expect(ok)
        let kinds = engine.document.paragraphs().map(\.kind)
        #expect(kinds == [.paragraph, .image(source: "upload:fu-1"), .paragraph])
        #expect((engine.document.storage.string) as? String == "Hello\n\u{FFFC}\nWorld")

        await engine.syncNow()
        let writes = FakeNotionServer.writes
        #expect(writes.map(\.description) == ["POST /v1/file_uploads", "POST /v1/file_uploads/fu-1/send", "PATCH /v1/blocks/page-1/children"])
        #expect((writes[0].body?["mode"]) as? String == "single_part")
        #expect((writes[0].body?["filename"]) as? String == "shot.png")
        #expect((writes[0].body?["content_type"]) as? String == "image/png")
        let send = writes[1]
        #expect(send.contentType?.hasPrefix("multipart/form-data; boundary=") == true)
        let raw = send.rawBody ?? Data()
        #expect(String(decoding: raw, as: UTF8.self).contains("Content-Disposition: form-data; name=\"file\"; filename=\"shot.png\"\r\nContent-Type: image/png\r\n\r\n"))
        #expect(raw.range(of: png) != nil)

        let children = writes[2].body?["children"] as? [AnyHashable]
        let child = children?.first as? [String: AnyHashable]
        #expect(children?.count == 1)
        #expect((child?["type"]) as? String == "image")
        let box = child?["image"] as? [String: AnyHashable]
        #expect((box?["type"]) as? String == "file_upload")
        #expect(((box?["file_upload"] as? [String: AnyHashable])?["id"]) as? String == "fu-1")
        #expect((((writes[2].body?["position"] as? [String: AnyHashable])?["after_block"] as? [String: AnyHashable])?["id"]) as? String == "p1")

        let ids = FakeNotionServer.childIDs(of: "page-1")
        #expect(ids.count == 3 && ids[0] == "p1" && ids[2] == "p2")
        #expect(engine.document.paragraphs()[1].blockID == ids[1])
        // Refetched, it's a Notion-hosted file image; a second sync has nothing to do.
        let fetched = try await engine.fetchDocument()
        #expect(fetched[1].kind == .image(source: "file:https://files.example/fu-1.png?X-Amz-Signature=abc"))
        FakeNotionServer.clearLog()
        await engine.syncNow()
        #expect(FakeNotionServer.writes.isEmpty)
    }

    @Test("a too-large image is refused before any request")
    func tooLarge() async {
        FakeNotionServer.reset()
        FakeNotionServer.seed(parent: "page-1", [(id: "p1", type: "paragraph", text: "Hello", extra: [:])])
        let engine = makeImageEngine()
        await engine.load()
        FakeNotionServer.clearLog()
        let ok = await engine.insertImage(data: Data(count: NotionClient.singlePartUploadLimit + 1), filename: "big.png", contentType: "image/png", afterParagraphAt: 0)
        #expect(!ok)
        #expect(FakeNotionServer.writes.isEmpty)
        #expect(engine.errorMessage != nil)
        #expect((engine.document.storage.string) as? String == "Hello")
    }

    @Test("Backspace on image paragraphs deletes the blocks — through the mass-delete guard")
    func imageDeleteGuard() async throws {
        FakeNotionServer.reset()
        FakeNotionServer.seed(parent: "page-1", [imageBlock("i1"), imageBlock("i2"), imageBlock("i3"), (id: "p1", type: "paragraph", text: "Text", extra: [:])])
        let engine = makeImageEngine()
        await engine.load()
        let doc = engine.document
        #expect(doc.paragraphs().map(\.kind.isImage) == [true, true, true, false])
        FakeNotionServer.clearLog()

        let host = TestEditorHost(document: doc)
        // Text can't be typed "into" a picture line by the commands; Backspace removes the block.
        for _ in 0..<3 {
            host.caret(at: 1) // right after the picture
            #expect(host.commands.deleteBackward())
        }
        #expect((doc.storage.string) as? String == "Text")
        await engine.syncNow()
        #expect(FakeNotionServer.writes.isEmpty)
        #expect(engine.pendingMassDelete == 3)

        engine.confirmMassDelete()
        for _ in 0..<100 where FakeNotionServer.childIDs(of: "page-1") != ["p1"] || engine.isSyncing {
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        #expect(FakeNotionServer.writes.filter { $0.method == "DELETE" }.count == 3)
        #expect(FakeNotionServer.childIDs(of: "page-1") == ["p1"])
    }
}

@MainActor
@Suite("Image blocks — multipart shape, atomic editing")
struct ImageBlockEditingTests {
    @Test("multipart body: one `file` part with filename + content type, CRLFs, closing boundary")
    func multipartShape() {
        var form = MultipartFormData(boundary: "XYZ")
        form.addFile(name: "file", filename: "shot.png", contentType: "image/png", data: Data("PNG".utf8))
        #expect((form.contentType) as? String == "multipart/form-data; boundary=XYZ")
        let body = String(decoding: form.finalized(), as: UTF8.self)
        #expect(body == "--XYZ\r\nContent-Disposition: form-data; name=\"file\"; filename=\"shot.png\"\r\nContent-Type: image/png\r\n\r\nPNG\r\n--XYZ--\r\n")
    }

    @Test("Backspace at the start of the line below a picture selects it; undo brings a deleted picture back")
    func backspaceSelectsThenDeletes() {
        let h = TestEditorHost([
            SyncedParagraph(blockID: "i", kind: .image(source: "file:https://files.example/i.png"), content: ""),
            SyncedParagraph(blockID: "p", kind: .paragraph, content: "After"),
        ])
        h.caret(at: 2)
        #expect(h.commands.deleteBackward())
        #expect(h.selection == NSRange(location: 0, length: 1))
        #expect(h.commands.deleteBackward())
        #expect(h.document.paragraphs().map(\.blockID) == ["p"])
        h.undo.undo()
        #expect(h.document.paragraphs().map(\.blockID) == ["i", "p"])
        #expect(h.document.paragraphs()[0].kind.isImage)
    }
}
