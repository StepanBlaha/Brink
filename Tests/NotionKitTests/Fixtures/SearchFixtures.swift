import Foundation

enum SearchFixtures {
    static let searchResponse = """
    {
      "object": "list",
      "results": [
        {
          "object": "page",
          "id": "page-1",
          "url": "https://notion.so/page-1",
          "icon": { "type": "emoji", "emoji": "📝" },
          "properties": {
            "Name": {
              "id": "title",
              "type": "title",
              "title": [{ "type": "text", "text": { "content": "My Task List" }, "plain_text": "My Task List" }]
            }
          }
        },
        {
          "object": "data_source",
          "id": "ds-1",
          "url": "https://notion.so/ds-1",
          "icon": { "type": "external", "external": { "url": "https://example.com/icon.png" } },
          "title": [{ "type": "text", "text": { "content": "Tasks" }, "plain_text": "Tasks" }]
        }
      ],
      "next_cursor": null,
      "has_more": false
    }
    """
}
