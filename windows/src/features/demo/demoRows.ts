import { DEMO_PAGES, IDS, SPRINT_ROWS, STATUS_OPTIONS, dayString } from "./demoContent";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null ? (v as Obj) : {});

export const rich = (s: string) => [{ type: "text", text: { content: s }, plain_text: s }];

export function rowObject(id: string, props: Obj): Obj {
  return { object: "page", id, url: `https://example.com/${id}`, icon: null, properties: props };
}

export function sprintRows(): Obj[] {
  return SPRINT_ROWS.map(([title, status, due, done], i) =>
    rowObject(`demo-row-${i + 1}`, {
      Name: { id: "title", type: "title", title: rich(title) },
      Status: { id: "st", type: "status", status: { name: status } },
      Done: { id: "dn", type: "checkbox", checkbox: done },
      Due: { id: "du", type: "date", date: due === null ? null : { start: dayString(due) } },
    }),
  );
}

export const sprintSchema = {
  object: "data_source", id: IDS.sprintSource, name: "Sprint", title: rich("Sprint"),
  properties: {
    Name: { id: "title", name: "Name", type: "title", title: {} },
    Status: {
      id: "st", name: "Status", type: "status",
      status: { options: STATUS_OPTIONS, groups: [
        { name: "To-do", option_ids: ["st-1"] }, { name: "In progress", option_ids: ["st-2"] }, { name: "Complete", option_ids: ["st-3"] },
      ] },
    },
    Due: { id: "du", name: "Due", type: "date", date: {} },
    Done: { id: "dn", name: "Done", type: "checkbox", checkbox: {} },
  },
};

/** The fake server's filter language: and/or, checkbox, status and select equals. */
export function matches(row: Obj, filter: unknown): boolean {
  const f = obj(filter);
  if (Array.isArray(f["and"])) return f["and"].every((x) => matches(row, x));
  if (Array.isArray(f["or"])) return f["or"].some((x) => matches(row, x));
  const name = f["property"];
  const prop = typeof name === "string" ? obj(obj(row["properties"])[name]) : undefined;
  if (!prop || Object.keys(prop).length === 0) return true;
  const eq = obj(f["checkbox"])["equals"];
  if (typeof eq === "boolean") return (prop["checkbox"] === true) === eq;
  for (const kind of ["status", "select"]) {
    const cond = obj(f[kind]);
    const current = obj(prop[kind])["name"];
    if (typeof cond["equals"] === "string") return current === cond["equals"];
    if (typeof cond["does_not_equal"] === "string") return current !== cond["does_not_equal"];
  }
  return true;
}

export const dueKey = (row: Obj): string => String(obj(obj(obj(row["properties"])["Due"])["date"])["start"] ?? "9999");

export function searchResults(query: string): Obj[] {
  const page = (id: string, emoji: string | null, title: string): Obj => ({
    object: "page", id, url: `https://example.com/${id}`, icon: emoji ? { type: "emoji", emoji } : null,
    properties: { Name: { id: "title", type: "title", title: rich(title) } },
  });
  const source = (id: string, emoji: string | null, title: string): Obj => ({
    object: "data_source", id, url: `https://example.com/${id}`, icon: emoji ? { type: "emoji", emoji } : null, title: rich(title),
  });
  const all = [
    page(IDS.groceriesPage, "\u{1F6D2}", "Groceries"), page(IDS.launchPage, "\u{1F680}", "Launch plan"),
    source(IDS.sprintSource, "\u{1F3C3}", "Sprint"), page(IDS.readingPage, "\u{1F4DA}", "Reading"),
    page("demo-page-long", "\u{1F4DD}", "Q4 planning notes and a very long title that keeps going past the edge of the panel"),
    page("demo-page-noicon", null, "Meeting notes"), page("demo-page-trip", "\u{2708}\u{FE0F}", "Trip to Lisbon"),
    source("demo-ds-tasks", null, "Personal tasks"),
  ];
  const q = query.trim().toLowerCase();
  const title = (o: Obj): string => {
    const t = obj(obj(o["properties"])["Name"])["title"] ?? o["title"];
    return (Array.isArray(t) ? t : []).map((x) => String(obj(x)["plain_text"] ?? "")).join("");
  };
  return q ? all.filter((o) => title(o).toLowerCase().includes(q)) : all;
}

export const pageEmoji = (id: string): string | undefined => DEMO_PAGES[id]?.emoji;

/** A property from a request body in the shape a page object returns (fake server `normalizeProperty`). */
export function normalize(value: unknown, existing: unknown): unknown {
  const prop = { ...obj(value) };
  const old = obj(existing);
  const known = ["title", "rich_text", "checkbox", "status", "date", "select", "number"];
  const type = (prop["type"] as string | undefined) ?? (old["type"] as string | undefined) ?? known.find((k) => k in prop) ?? "rich_text";
  prop["type"] = type;
  prop["id"] = old["id"] ?? type;
  if (type === "title" || type === "rich_text") {
    const items = Array.isArray(prop[type]) ? (prop[type] as Obj[]) : [];
    prop[type] = items.map((i) => ({ ...i, plain_text: String(obj(i["text"])["content"] ?? i["plain_text"] ?? "") }));
  }
  return prop;
}
