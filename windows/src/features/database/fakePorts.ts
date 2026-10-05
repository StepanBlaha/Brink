import type { DataSourceSchema } from "../../domain/notion/dataSourceSchema";
import type { JsonValue } from "../../domain/notion/json";
import type { Operation } from "../../domain/notion/pendingWrite";
import type { Row } from "../../domain/notion/row";
import type { QueueOutcome } from "../../ipc/types";
import type { DatabasePorts } from "./ports";

const opt = (id: string, name: string, color = "default") => ({ id, name, color });

/** Schema of the fake "Sprint" database: Name, Done (checkbox), Status, Due (date). */
export const sprintSchema: DataSourceSchema = {
  id: "ds-sprint",
  name: "Sprint",
  properties: [
    { id: "d", name: "Done", type: "checkbox" },
    { id: "u", name: "Due", type: "date" },
    { id: "n", name: "Name", type: "title" },
    {
      id: "s", name: "Status", type: "status",
      statusOptions: [opt("o1", "Not started"), opt("o2", "In progress", "blue"), opt("o3", "Done", "green")],
      statusGroups: [{ name: "Complete", optionIds: ["o3"] }],
    },
  ],
};

export function sprintRow(id: string, title: string, o: { done?: boolean; due?: string; status?: string } = {}): Row {
  const properties: Row["properties"] = {
    Name: { type: "title", title },
    Done: { type: "checkbox", checkbox: o.done ?? false },
    Status: { type: "status", status: { name: o.status ?? "Not started" } },
  };
  if (o.due) properties["Due"] = { type: "date", date: { start: o.due } };
  return { id, icon: { type: "none" }, title, properties };
}

export interface Fake {
  ports: DatabasePorts;
  rows: Row[];
  ops: Operation[];
  queries: { filter: JsonValue | null; sorts: JsonValue | null }[];
  /** Next outcome(s) for `queue.submit`; default saved. */
  outcomes: QueueOutcome[];
  failQuery?: unknown;
}

/** In-memory Notion + queue + cache. The queue applies simple property writes to its rows. */
export function createFake(rows: Row[], schema: DataSourceSchema = sprintSchema): Fake {
  const fake: Fake = { rows: [...rows], ops: [], queries: [], outcomes: [], ports: undefined as never };
  const cache = new Map<string, Row[]>();
  fake.ports = {
    notion: {
      retrieveDatabase: () => Promise.resolve([{ id: schema.id, name: schema.name }]),
      retrieveDataSource: () => Promise.resolve(schema),
      queryDataSource(_id, filter, sorts) {
        fake.queries.push({ filter, sorts });
        if (fake.failQuery) return Promise.reject(fake.failQuery);
        return Promise.resolve(fake.rows.filter((r) => matches(r, filter)));
      },
    },
    queue: {
      submit(op) {
        fake.ops.push(op);
        const out = fake.outcomes.shift() ?? { kind: "saved" as const };
        if (out.kind === "saved") apply(fake, op);
        return Promise.resolve(out);
      },
    },
    cache: {
      loadRows: (k) => Promise.resolve(cache.get(k) ?? null),
      saveRows: (k, r) => (cache.set(k, r), Promise.resolve()),
    },
  };
  return fake;
}

function matches(r: Row, f: JsonValue | null): boolean {
  if (!f || typeof f !== "object" || Array.isArray(f)) return true;
  if (Array.isArray(f["and"])) return f["and"].every((p) => matches(r, p));
  const prop = f["property"];
  const v = typeof prop === "string" ? r.properties[prop] : undefined;
  const cb = f["checkbox"] as { equals?: boolean } | undefined;
  if (cb && v?.type === "checkbox") return v.checkbox === cb.equals;
  const st = f["status"] as { does_not_equal?: string } | undefined;
  if (st && v?.type === "status") return v.status?.name !== st.does_not_equal;
  return true;
}

function apply(fake: Fake, op: Operation): void {
  if (op.kind === "toggleDone") patch(fake, op.pageId, [op.update]);
  else if (op.kind === "updateProperty") patch(fake, op.pageId, op.updates);
  else if (op.kind === "createRow") fake.rows.unshift(sprintRow(`row-${fake.rows.length + 100}`, op.title));
}

function patch(fake: Fake, id: string, updates: { name: string; value: Row["properties"][string] }[]): void {
  fake.rows = fake.rows.map((r) => {
    if (r.id !== id) return r;
    const properties = { ...r.properties };
    for (const u of updates) properties[u.name] = u.value;
    return { ...r, properties };
  });
}
