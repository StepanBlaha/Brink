import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseConfig } from "../../domain/store/pin";
import { DatabaseModel } from "./databaseModel";
import { createFake, sprintRow, sprintSchema, type Fake } from "./fakePorts";
import { buildFilter, buildSorts, inferConfig } from "./queryBuilder";

const checkboxCfg: DatabaseConfig = { doneProperty: "Done", doneKind: "checkbox", dateProperty: "Due", showDone: false };
const statusCfg: DatabaseConfig = { doneProperty: "Status", doneKind: "status", doneValue: "Done", showDone: false };

function rows() {
  return [sprintRow("a", "Alpha", { due: "2026-10-06" }), sprintRow("b", "Beta", { due: "2026-10-07T09:30:00+02:00" }), sprintRow("c", "Gamma")];
}
function make(cfg: DatabaseConfig | null, fake: Fake = createFake(rows())) {
  return { fake, model: new DatabaseModel("ds-sprint", cfg, "k", fake.ports, sprintSchema) };
}

describe("query building", () => {
  it("checkbox done filter, omitted with showDone", () => {
    expect(buildFilter(checkboxCfg, false)).toEqual({ property: "Done", checkbox: { equals: false } });
    expect(buildFilter(checkboxCfg, true)).toBeNull();
  });
  it("status done filter uses does_not_equal", () => {
    expect(buildFilter(statusCfg, false)).toEqual({ property: "Status", status: { does_not_equal: "Done" } });
  });
  it("done filter AND saved filters", () => {
    const cfg: DatabaseConfig = { ...checkboxCfg, filters: [{ id: "f", property: "Status", op: "statusIs", optionValues: ["In progress"] }] };
    expect(buildFilter(cfg, false)).toEqual({
      and: [{ property: "Done", checkbox: { equals: false } }, { property: "Status", status: { equals: "In progress" } }],
    });
    expect(buildFilter(cfg, true)).toEqual({ property: "Status", status: { equals: "In progress" } });
  });
  it("sorts: saved, else date ascending, else created_time descending", () => {
    expect(buildSorts({ ...checkboxCfg, sorts: [{ id: "s", property: "Name", ascending: false }] })).toEqual([{ property: "Name", direction: "descending" }]);
    expect(buildSorts(checkboxCfg)).toEqual([{ property: "Due", direction: "ascending" }]);
    expect(buildSorts({ doneProperty: "Done", doneKind: "checkbox", showDone: false })).toEqual([{ timestamp: "created_time", direction: "descending" }]);
  });
  it("infers config from the schema", () => {
    expect(inferConfig(sprintSchema)).toEqual({ doneProperty: "Done", doneKind: "checkbox", dateProperty: "Due", showDone: false });
    const noCheckbox = { ...sprintSchema, properties: sprintSchema.properties.filter((p) => p.type !== "checkbox") };
    expect(inferConfig(noCheckbox)).toEqual({ doneProperty: "Status", doneKind: "status", doneValue: "Done", dateProperty: "Due", showDone: false });
    expect(inferConfig({ ...sprintSchema, properties: [{ id: "n", name: "Name", type: "title" }] })).toBeNull();
  });
});

describe("DatabaseModel", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("loads rows and queries with the done filter", async () => {
    const { fake, model } = make(checkboxCfg);
    await model.load();
    expect(model.getState().rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(fake.queries[0]?.filter).toEqual({ property: "Done", checkbox: { equals: false } });
  });

  it("quick add inserts temp-<uuid> at 0 and removes it on failed", async () => {
    const { fake, model } = make(checkboxCfg);
    await model.load();
    fake.outcomes.push({ kind: "failed", message: "No access" });
    const p = model.quickAdd("  New  ");
    expect(model.getState().rows[0]?.id).toMatch(/^temp-/);
    expect(model.getState().rows[0]?.title).toBe("New");
    await p;
    expect(model.getState().rows.some((r) => r.id.startsWith("temp-"))).toBe(false);
    expect(model.getState().errorMessage).toBe("No access");
  });

  it("quick add queued shows Not synced yet and keeps the row; saved reloads", async () => {
    const { fake, model } = make(checkboxCfg);
    await model.load();
    fake.outcomes.push({ kind: "queued", message: "offline" });
    await model.quickAdd("Offline task");
    expect(model.getState().errorMessage).toBe("Not synced yet: offline");
    expect(model.getState().rows[0]?.title).toBe("Offline task");
    await model.quickAdd("Online task");
    expect(model.getState().errorMessage).toBeNull();
    expect(model.getState().rows.some((r) => r.title === "Online task")).toBe(true);
  });

  it("marking done fades the row for 0.8 s then removes it", async () => {
    const { model } = make(checkboxCfg);
    await model.load();
    await model.toggleDone("a");
    expect(model.getState().animatingOut.has("a")).toBe(true);
    expect(model.getState().rows.some((r) => r.id === "a")).toBe(true);
    vi.advanceTimersByTime(799);
    expect(model.getState().rows.some((r) => r.id === "a")).toBe(true);
    vi.advanceTimersByTime(2);
    expect(model.getState().rows.some((r) => r.id === "a")).toBe(false);
    expect(model.getState().animatingOut.has("a")).toBe(false);
  });

  it("with showDone the row stays and does not animate", async () => {
    const { model } = make({ ...checkboxCfg, showDone: true });
    await model.load();
    await model.toggleDone("a");
    expect(model.getState().animatingOut.size).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(model.getState().rows.find((r) => r.id === "a")).toBeDefined();
    expect(model.isDone(model.getState().rows[0]!)).toBe(true);
  });

  it("toggleDone rolls back on failed", async () => {
    const { fake, model } = make(checkboxCfg);
    await model.load();
    fake.outcomes.push({ kind: "failed", message: "nope" });
    await model.toggleDone("a");
    expect(model.getState().animatingOut.size).toBe(0);
    expect(model.isDone(model.getState().rows[0]!)).toBe(false);
    expect(model.getState().errorMessage).toBe("nope");
  });

  it("status done sets the done option; un-done picks the first non-done option", async () => {
    const { fake, model } = make({ ...statusCfg, showDone: true });
    await model.load();
    await model.toggleDone("a");
    expect(fake.ops[0]).toMatchObject({ kind: "toggleDone", update: { name: "Status", value: { status: { name: "Done" } } } });
    await model.toggleDone("a");
    expect(fake.ops[1]).toMatchObject({ update: { value: { status: { name: "Not started" } } } });
  });

  it("rename is optimistic, skips unchanged and blank, rolls back on failure", async () => {
    const { fake, model } = make(checkboxCfg);
    await model.load();
    await model.rename("a", "Alpha");
    await model.rename("a", "   ");
    expect(fake.ops).toHaveLength(0);
    fake.outcomes.push({ kind: "failed", message: "x" });
    await model.rename("a", "Renamed");
    expect(model.getState().rows[0]?.title).toBe("Alpha");
    await model.rename("a", " Renamed ");
    expect(model.getState().rows[0]?.title).toBe("Renamed");
    expect(fake.ops[1]).toMatchObject({ kind: "updateProperty", updates: [{ name: "Name", value: { title: "Renamed" } }] });
  });

  it("snooze: later today needs a time; tomorrow and next week keep the time", async () => {
    const { fake, model } = make(checkboxCfg);
    await model.load();
    const now = new Date(2026, 8, 29, 10, 0);
    await model.snooze("a", "laterToday", now);
    expect(fake.ops).toHaveLength(0);
    await model.snooze("b", "tomorrow", now);
    const start = (fake.ops[0] as { updates: { value: { date?: { start: string } } }[] }).updates[0]?.value.date?.start;
    expect(start).toMatch(/^2026-09-30T09:30:00[+-]\d\d:\d\d$/);
    await model.snooze("a", "nextWeek", now);
    expect((fake.ops[1] as { updates: { value: { date?: { start: string } } }[] }).updates[0]?.value.date?.start).toBe("2026-10-05");
  });

  it("setDate(null) clears the date, setStatus writes the pill", async () => {
    const { fake, model } = make(checkboxCfg);
    await model.load();
    await model.setDate("a", null);
    expect(fake.ops[0]).toMatchObject({ updates: [{ name: "Due", value: { type: "date" } }] });
    await model.setStatus("a", "In progress");
    expect(model.statusName(model.getState().rows[0]!)).toBe("In progress");
  });

  it("show completed reloads without the done filter", async () => {
    const { fake, model } = make(checkboxCfg);
    await model.load();
    await model.setShowDone(true);
    expect(fake.queries.at(-1)?.filter).toBeNull();
  });

  it("not found error message, cache first, read-only without config", async () => {
    const fake = createFake(rows());
    fake.failQuery = { kind: "notFound", message: "x" };
    const model = new DatabaseModel("ds", checkboxCfg, "k", fake.ports, sprintSchema);
    await fake.ports.cache.saveRows("k", rows().slice(0, 1));
    await model.load();
    expect(model.getState().rows).toHaveLength(1);
    expect(model.getState().errorMessage).toBe("Database not found. Share it with your integration in Notion.");
    expect(make(null).model.isReadOnly).toBe(true);
  });

  it("status pill only for checkbox done with a status property", () => {
    expect(make(checkboxCfg).model.statusPropertyName).toBe("Status");
    expect(make(statusCfg).model.statusPropertyName).toBeNull();
  });

  it("polls every 45 s", async () => {
    const { fake, model } = make(checkboxCfg);
    await model.load();
    model.startPolling();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(fake.queries).toHaveLength(2);
    model.stopPolling();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(fake.queries).toHaveLength(2);
  });
});
