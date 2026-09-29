import Testing
@testable import NotionKit

@Suite("RichText")
struct RichTextTests {
    @Test("chunks text at the character limit")
    func chunking() {
        let text = String(repeating: "a", count: 4500)
        let chunks = RichText.chunked(text, limit: 2000)
        #expect(chunks.count == 3)
        #expect(chunks[0].count == 2000)
        #expect(chunks[1].count == 2000)
        #expect(chunks[2].count == 500)
        #expect(chunks.joined() == text)
    }

    @Test("short text is a single chunk")
    func shortText() {
        #expect(RichText.chunked("hello", limit: 2000) == ["hello"])
    }

    @Test("empty text yields one empty chunk")
    func emptyText() {
        #expect(RichText.chunked("", limit: 2000) == [""])
    }

    @Test("encode produces text objects for each chunk")
    func encode() {
        let text = String(repeating: "b", count: 2500)
        let items = RichText.encode(text, limit: 2000)
        #expect(items.count == 2)
        if case .object(let first) = items[0], case .object(let textBox) = first["text"]!, case .string(let content) = textBox["content"]! {
            #expect(content.count == 2000)
        } else {
            Issue.record("Unexpected shape")
        }
    }
}
