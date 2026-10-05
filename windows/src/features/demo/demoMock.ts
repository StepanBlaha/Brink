import { FakeNotionServer } from "../../test/fakeNotion";
import { DEMO_PAGES, IDS } from "./demoContent";
import { dueKey, matches, normalize, pageEmoji, rich, rowObject, searchResults, sprintRows, sprintSchema } from "./demoRows";

type Obj = Record<string, unknown>;
type Args = Record<string, unknown>;

/** Queue-shaped position (`{after:{_0}}`, `{start:{}}`, `{end:{}}`) to the API's `position`. */
export function apiPosition(p: unknown): unknown {
  const o = (p ?? {}) as Obj;
  if ("start" in o) return { type: "start" };
  if ("after" in o) return { type: "after_block", after_block: { id: ((o["after"] ?? {}) as Obj)["_0"] } };
  return undefined;
}

/** Browser-dev answers for the Notion commands, on the fake server seeded with the demo pages. */
export function createDemoNotionMock(): (cmd: string, a: Args) => unknown {
  const server = new FakeNotionServer();
  for (const [pageId, page] of Object.entries(DEMO_PAGES)) {
    server.seedPage(pageId, { object: "page", id: pageId, cover: null, icon: { type: "emoji", emoji: page.emoji } });
    // The fake server only appends to known blocks; a page is a block of its own id.
    server.blocks.set(pageId, { object: "block", id: pageId, type: "child_page", child_page: { title: pageId } });
    server.seed(pageId, page.blocks);
    for (const [parent, kids] of Object.entries(page.nested ?? {})) server.seed(parent, kids);
  }
  let rows = sprintRows();
  let counter = 1;
  const call = (method: string, path: string, body: Obj | null = null) => server.handle(method, path, body).json;
  const results = (json: unknown): unknown[] => ((json as Obj)["results"] as unknown[]) ?? [];
  const findRow = (id: unknown) => rows.find((r) => r["id"] === id);
  const setProps = (row: Obj, patch: Obj) => {
    const props = { ...(row["properties"] as Obj) };
    for (const [k, v] of Object.entries(patch)) props[k] = normalize(v, props[k]);
    row["properties"] = props;
  };
  return (cmd, a) => {
    switch (cmd) {
      case "notion_search": return searchResults((a["query"] as string | null) ?? "");
      case "notion_retrieve_data_source": return sprintSchema;
      case "notion_retrieve_database": return [{ id: IDS.sprintSource, name: "Sprint" }];
      case "notion_query_data_source": {
        const hit = rows.filter((r) => matches(r, a["filter"]));
        return hit.sort((x, y) => dueKey(x).localeCompare(dueKey(y)));
      }
      case "notion_create_row": {
        const row = rowObject(`demo-row-new-${counter++}`, {
          Done: { id: "dn", type: "checkbox", checkbox: false },
          Status: { id: "st", type: "status", status: { name: "Not started" } },
          Due: { id: "du", type: "date", date: null },
          Name: { id: "title", type: "title", title: rich(String(a["title"] ?? "")) },
        });
        rows = [...rows, row];
        return [row];
      }
      case "notion_update_page_properties": {
        const row = findRow(a["pageId"]);
        if (row) setProps(row, (a["properties"] ?? {}) as Obj);
        return row ?? null;
      }
      case "notion_retrieve_page": {
        const row = findRow(a["id"]);
        if (row) return row;
        const emoji = pageEmoji(String(a["id"]));
        return emoji ? { object: "page", id: a["id"], cover: null, icon: { type: "emoji", emoji } } : null;
      }
      case "notion_set_page_emoji_icon": return null;
      case "notion_block_children": return results(call("GET", `/v1/blocks/${a["id"]}/children`));
      case "notion_retrieve_block": return call("GET", `/v1/blocks/${a["id"]}`);
      case "notion_update_block": return call("PATCH", `/v1/blocks/${a["id"]}`, a["payload"] as Obj);
      case "notion_delete_block": return call("DELETE", `/v1/blocks/${a["id"]}`);
      case "notion_append_blocks": {
        const position = apiPosition(a["position"]);
        const body = { children: a["children"], ...(position ? { position } : {}) };
        return results(call("PATCH", `/v1/blocks/${a["parentId"]}/children`, body as Obj));
      }
      default: return undefined;
    }
  };
}
