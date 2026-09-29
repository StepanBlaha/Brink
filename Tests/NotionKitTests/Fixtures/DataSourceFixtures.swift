import Foundation

enum DataSourceFixtures {
    static let schemaResponse = """
    {
      "object": "data_source",
      "id": "ds-1",
      "name": "Tasks",
      "properties": {
        "Name": { "id": "title", "name": "Name", "type": "title", "title": {} },
        "Done": { "id": "abcd", "name": "Done", "type": "checkbox", "checkbox": {} },
        "Status": {
          "id": "efgh",
          "name": "Status",
          "type": "status",
          "status": {
            "options": [
              { "id": "opt-1", "name": "Not started", "color": "default" },
              { "id": "opt-2", "name": "Done", "color": "green" }
            ],
            "groups": []
          }
        },
        "Priority": {
          "id": "ijkl",
          "name": "Priority",
          "type": "select",
          "select": {
            "options": [
              { "id": "opt-3", "name": "High", "color": "red" },
              { "id": "opt-4", "name": "Low", "color": "gray" }
            ]
          }
        },
        "Due": { "id": "mnop", "name": "Due", "type": "date", "date": {} }
      }
    }
    """

    static let queryResponse = """
    {
      "object": "list",
      "results": [
        {
          "object": "page",
          "id": "row-1",
          "url": "https://notion.so/row-1",
          "icon": null,
          "properties": {
            "Name": {
              "id": "title",
              "type": "title",
              "title": [{ "type": "text", "text": { "content": "Buy milk" }, "plain_text": "Buy milk" }]
            },
            "Done": { "id": "abcd", "type": "checkbox", "checkbox": false },
            "Status": {
              "id": "efgh",
              "type": "status",
              "status": { "id": "opt-1", "name": "Not started", "color": "default" }
            },
            "Due": { "id": "mnop", "type": "date", "date": { "start": "2026-10-01", "end": null } }
          }
        }
      ],
      "next_cursor": "cursor-2",
      "has_more": true
    }
    """

    static let queryResponsePage2 = """
    {
      "object": "list",
      "results": [
        {
          "object": "page",
          "id": "row-2",
          "url": "https://notion.so/row-2",
          "icon": { "type": "emoji", "emoji": "✅" },
          "properties": {
            "Name": {
              "id": "title",
              "type": "title",
              "title": [{ "type": "text", "text": { "content": "Ship NotionKit" }, "plain_text": "Ship NotionKit" }]
            },
            "Done": { "id": "abcd", "type": "checkbox", "checkbox": true },
            "Status": {
              "id": "efgh",
              "type": "status",
              "status": { "id": "opt-2", "name": "Done", "color": "green" }
            },
            "Due": { "id": "mnop", "type": "date", "date": null }
          }
        }
      ],
      "next_cursor": null,
      "has_more": false
    }
    """
}
