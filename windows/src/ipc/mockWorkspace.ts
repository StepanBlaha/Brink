import { addGroup, addPin, movePinAmongAll, movePinWithinGroup, moveGroups, removePin, renameGroup, setPinGroup, updatePin, deleteGroup } from "../domain/store/pinOrdering";
import { decodePin, encodeGroups, encodePins, type Pin, type PinGroup } from "../domain/store/pin";

/** Browser-dev stand-in for the Rust pin, group, auth and search commands (in-memory). */
const rich = (s: string) => [{ type: "text", text: { content: s }, plain_text: s }];
const page = (id: string, title: string, emoji?: string) => ({
  object: "page", id, url: `https://notion.so/${id}`,
  ...(emoji ? { icon: { type: "emoji", emoji } } : {}),
  properties: { Name: { id: "title", type: "title", title: rich(title) } },
});
const source = (id: string, title: string, emoji?: string) => ({
  object: "data_source", id, url: `https://notion.so/${id}`, title: rich(title),
  ...(emoji ? { icon: { type: "emoji", emoji } } : {}),
});
const WORKSPACE = [
  source("ds-tasks", "Tasks", "✅"), page("pg-reading", "Reading list", "📖"), page("pg-notes", "Meeting notes", "📝"),
  source("ds-projects", "Projects", "🚀"), page("pg-untitled", ""), page("pg-roadmap", "Roadmap 2027"),
  page("pg-ideas", "Ideas", "💡"), source("ds-habits", "Habits"),
];
const titleOf = (r: (typeof WORKSPACE)[number]): string =>
  "title" in r ? (r.title[0]?.plain_text ?? "") : (r.properties.Name.title[0]?.plain_text ?? "");
const opt = (name: string, i: number) => ({ id: `${name}-${i}`, name, color: "default" });
const SCHEMA = {
  object: "data_source", id: "ds-tasks", title: rich("Tasks"),
  properties: {
    Name: { id: "title", name: "Name", type: "title", title: {} },
    Done: { id: "done", name: "Done", type: "checkbox", checkbox: {} },
    Status: {
      id: "status", name: "Status", type: "status",
      status: {
        options: ["Not started", "In progress", "Done"].map(opt),
        groups: [{ id: "g", name: "Complete", option_ids: ["Done-2"] }],
      },
    },
    Priority: { id: "prio", name: "Priority", type: "select", select: { options: ["Low", "High"].map(opt) } },
    Due: { id: "due", name: "Due", type: "date", date: {} },
    Notes: { id: "notes", name: "Notes", type: "rich_text", rich_text: {} },
  },
};

const SEEDS: [string, "page" | "dataSource", string, string][] = [
  ["Tasks", "dataSource", "✅", "ds-tasks"], ["Reading list", "page", "📖", "pg-reading"], ["Notes", "page", "📝", "pg-notes"],
  ["Projects", "dataSource", "🚀", "ds-projects"], ["Ideas", "page", "", "pg-ideas"],
];

export function createWorkspaceMock(seedPins: number) {
  let pins: Pin[] = [];
  let groups: PinGroup[] = [];
  let connected = seedPins > 0 || new URLSearchParams(window.location.search).get("auth") === "1";
  SEEDS.slice(0, seedPins).forEach(([title, kind, emoji, notionId], i) => {
    const icon = emoji ? { emoji: { _0: emoji } } : { none: {} };
    const config = kind === "dataSource" ? { config: { doneProperty: "Done", doneKind: "checkbox" as const, showDone: false } } : {};
    pins = addPin(pins, { id: `pin-${i}`, notionId, kind, title, icon, order: 0, ...config });
  });
  const counter = { n: 0 };
  return (cmd: string, a: Record<string, unknown>): unknown => {
    switch (cmd) {
      case "pins_get": return encodePins(pins);
      case "pins_add": pins = addPin(pins, decodePin(a["pin"])); return null;
      case "pins_remove": pins = removePin(pins, a["id"] as string); return null;
      case "pins_update": pins = updatePin(pins, decodePin(a["pin"])); return null;
      case "pins_move_within_group":
        pins = a["groupId"] == null ? movePinAmongAll(pins, a["pinId"] as string, a["toIndex"] as number)
          : movePinWithinGroup(pins, a["pinId"] as string, a["toIndex"] as number, a["groupId"] as string);
        return null;
      case "pins_move_among_all": pins = movePinAmongAll(pins, a["pinId"] as string, a["toIndex"] as number); return null;
      case "pins_set_group": pins = setPinGroup(pins, a["pinId"] as string, (a["groupId"] as string | null) ?? undefined); return null;
      case "groups_get": return encodeGroups(groups);
      case "groups_add": {
        const emoji = (a["emoji"] as string | null) ?? undefined;
        groups = addGroup(groups, `group-${++counter.n}`, a["name"] as string, emoji).groups;
        return null;
      }
      case "groups_rename": groups = renameGroup(groups, a["id"] as string, a["name"] as string, (a["emoji"] as string | null) ?? undefined); return null;
      case "groups_delete": { const r = deleteGroup(groups, pins, a["id"] as string); groups = r.groups; pins = r.pins; return null; }
      case "groups_move": groups = moveGroups(groups, a["from"] as number[], a["to"] as number); return null;
      case "auth_status": return { kind: connected ? "internal" : null };
      case "auth_save_token": connected = true; return null;
      case "auth_disconnect": connected = false; return null;
      case "auth_test_connection": return { count: WORKSPACE.length };
      case "notion_search": {
        const q = ((a["query"] as string | null) ?? "").trim().toLowerCase();
        const hit = (r: (typeof WORKSPACE)[number]) => q === "" || titleOf(r).toLowerCase().includes(q);
        return WORKSPACE.filter(hit);
      }
      case "notion_retrieve_data_source": return SCHEMA;
      case "open_in_notion": case "show_settings": return null;
      default: return undefined;
    }
  };
}
