import { describe, expect, it } from "vitest";
import type { Block, BlockType } from "../notion/block";
import type { Row } from "../notion/row";
import type { PropertyValue } from "../notion/propertyValue";
import { span } from "../notion/richText";
import type { DatabaseConfig } from "./pin";
import { emptySummary, progressRatio, summaryFromBlocks, summaryFromRows } from "./pinSummary";

const block = (id: string, type: BlockType, text: string): Block => ({ id, type, hasChildren: false, richText: text ? [span(text)] : [] });
const todo = (id: string, text: string, checked: boolean): Block => block(id, { kind: "toDo", checked }, text);

const row = (id: string, title: string, done: boolean, due?: string): Row => {
  const properties: Record<string, PropertyValue> = { Name: { type: "title", title }, Done: { type: "checkbox", checkbox: done } };
  if (due) properties["Due"] = { type: "date", date: { start: due } };
  return { id, icon: { type: "none" }, title, properties };
};

describe("PinSummaryTests", () => {
  it("blocks: only to-dos count, next items are the first three open titles", () => {
    const s = summaryFromBlocks([
      block("p", { kind: "paragraph" }, "hello"),
      todo("1", "a", false), todo("2", "b", true), todo("3", "c", false), todo("4", "d", false), todo("5", "e", false),
    ]);
    expect([s.total, s.doneCount, s.openCount, s.dueTodayCount]).toEqual([5, 1, 4, 0]);
    expect(s.nextItems).toEqual(["a", "c", "d"]);
    expect(s.nextRefs.map((r) => r.id)).toEqual(["1", "3", "4", "5"]);
  });

  it("rows with checkbox config: done, open, due today", () => {
    const config: DatabaseConfig = { doneProperty: "Done", doneKind: "checkbox", dateProperty: "Due", showDone: false };
    const rows = [
      row("1", "x", false, "2026-09-29"), row("2", "y", false, "2026-09-29T10:00:00.000+02:00"),
      row("3", "z", true, "2026-09-29"), row("4", "w", false, "2026-09-30"), row("5", "", false),
    ];
    const s = summaryFromRows(rows, config, "2026-09-29");
    expect([s.total, s.doneCount, s.openCount, s.dueTodayCount]).toEqual([5, 1, 4, 2]);
    expect(s.nextItems).toEqual(["x", "y", "w"]);
    expect(s.nextRefs.at(-1)?.title).toBe("Untitled");
  });

  it("rows with status config", () => {
    const config: DatabaseConfig = { doneProperty: "Status", doneKind: "status", doneValue: "Done", showDone: false };
    const status = (id: string, name?: string): Row => ({
      id, icon: { type: "none" }, title: id,
      properties: { Status: name === undefined ? { type: "status" } : { type: "status", status: { name } } },
    });
    const s = summaryFromRows([status("1", "Done"), status("2", "To do"), status("3")], config, "2026-09-29");
    expect([s.doneCount, s.openCount, s.total, s.dueTodayCount]).toEqual([1, 2, 3, 0]);
  });

  it("progress ratio", () => {
    const a = { ...emptySummary(), openCount: 1, doneCount: 1, total: 2 };
    const b = { ...emptySummary(), doneCount: 2, total: 2 };
    expect(progressRatio([a, b])).toBe(0.75);
    expect(progressRatio([emptySummary()])).toBeNull();
  });
});
