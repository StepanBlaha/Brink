import { describe, expect, it } from "vitest";
import { apiPosition, createDemoNotionMock } from "./demoMock";
import { dayString } from "./demoContent";

type Obj = Record<string, unknown>;
const text = (b: Obj) => ((b[b["type"] as string] as Obj)["rich_text"] as Obj[]).map((r) => r["plain_text"]).join("");

describe("demo notion mock", () => {
  it("serves the Mac pages with their blocks", () => {
    const m = createDemoNotionMock();
    const groceries = m("notion_block_children", { id: "demo-page-groceries" }) as Obj[];
    expect(groceries.map(text)).toEqual(["Oat milk", "Sourdough bread", "Basil and cherry tomatoes", "Coffee beans", "Lemons"]);
    expect(((groceries[4]!["to_do"]) as Obj)["checked"]).toBe(true);
    const launch = m("notion_block_children", { id: "demo-page-launch" }) as Obj[];
    expect(launch).toHaveLength(10);
    const toggle = launch.find((b) => b["type"] === "toggle")!;
    expect(toggle["has_children"]).toBe(true);
    expect(m("notion_block_children", { id: toggle["id"] })).toHaveLength(2);
    expect((m("notion_retrieve_page", { id: "demo-page-reading" }) as Obj)["icon"]).toEqual({ type: "emoji", emoji: "\u{1F4DA}" });
  });

  it("searches like the fake server", () => {
    const m = createDemoNotionMock();
    expect(m("notion_search", { query: null })).toHaveLength(8);
    const hit = m("notion_search", { query: "sprint" }) as Obj[];
    expect(hit).toHaveLength(1);
    expect(hit[0]!["object"]).toBe("data_source");
  });

  it("queries sprint rows sorted by due date with the done filter", () => {
    const m = createDemoNotionMock();
    const all = m("notion_query_data_source", { id: "demo-ds-sprint", filter: null, sorts: null }) as Obj[];
    expect(all).toHaveLength(6);
    const first = (all[0]!["properties"] as Obj)["Due"] as Obj;
    expect((first["date"] as Obj)["start"]).toBe(dayString(-1));
    const open = m("notion_query_data_source", { id: "x", filter: { property: "Done", checkbox: { equals: false } }, sorts: null }) as Obj[];
    expect(open).toHaveLength(5);
  });

  it("updates a row and creates one", () => {
    const m = createDemoNotionMock();
    m("notion_update_page_properties", { pageId: "demo-row-2", properties: { Done: { checkbox: true } } });
    const open = m("notion_query_data_source", { id: "x", filter: { property: "Done", checkbox: { equals: false } } }) as Obj[];
    expect(open).toHaveLength(4);
    m("notion_create_row", { dataSourceId: "x", title: "Book travel", extra: [] });
    expect(m("notion_query_data_source", { id: "x", filter: null })).toHaveLength(7);
  });

  it("appends at a position and deletes", () => {
    const m = createDemoNotionMock();
    const block = { type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "Eggs" } }] } };
    const made = m("notion_append_blocks", { parentId: "demo-page-groceries", children: [block], position: { start: {} } }) as Obj[];
    const kids = m("notion_block_children", { id: "demo-page-groceries" }) as Obj[];
    expect(kids[0]!["id"]).toBe(made[0]!["id"]);
    m("notion_delete_block", { id: made[0]!["id"] });
    expect(m("notion_block_children", { id: "demo-page-groceries" })).toHaveLength(5);
  });

  it("leaves other commands to the workspace mock", () => {
    expect(createDemoNotionMock()("pins_get", {})).toBeUndefined();
  });

  it("converts queue positions to the API shape", () => {
    expect(apiPosition({ end: {} })).toBeUndefined();
    expect(apiPosition({ start: {} })).toEqual({ type: "start" });
    expect(apiPosition({ after: { _0: "b1" } })).toEqual({ type: "after_block", after_block: { id: "b1" } });
  });
});
