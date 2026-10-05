import { describe, expect, it } from "vitest";
import type { JsonValue } from "./json";
import { filterJSON, sortsJSON, viewFilterRequestJSON, type ViewFilter, type ViewSort } from "./viewFilter";

// 2026-09-28 at UTC midnight, deterministic regardless of TZ.
const referenceDate = new Date(Date.UTC(2026, 8, 28));

let n = 0;
const f = (o: Omit<ViewFilter, "id">): ViewFilter => ({ id: `f${++n}`, ...o });
const j = (v: JsonValue | null): Record<string, any> => v as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("ViewFilter / ViewSort JSON", () => {
  it("checkbox is / isn't", () => {
    expect(j(viewFilterRequestJSON(f({ property: "Done", op: "checkboxIs" })))).toEqual({ property: "Done", checkbox: { equals: true } });
    expect(j(viewFilterRequestJSON(f({ property: "Done", op: "checkboxIsNot" })))["checkbox"]["equals"]).toBe(false);
  });

  it("status is / is not / any of", () => {
    expect(j(viewFilterRequestJSON(f({ property: "Status", op: "statusIs", optionValues: ["Done"] })))["status"]["equals"]).toBe("Done");
    expect(j(viewFilterRequestJSON(f({ property: "Status", op: "statusIsNot", optionValues: ["Done"] })))["status"]["does_not_equal"]).toBe("Done");
    expect(j(viewFilterRequestJSON(f({ property: "Status", op: "statusIsAnyOf", optionValues: ["Done"] })))["status"]["equals"]).toBe("Done");
    const anyOf = j(viewFilterRequestJSON(f({ property: "Status", op: "statusIsAnyOf", optionValues: ["Done", "In progress"] })));
    expect(anyOf["or"].length).toBe(2);
    expect(anyOf["or"][0]["property"]).toBe("Status");
    expect(anyOf["or"][0]["status"]["equals"]).toBe("Done");
    expect(anyOf["or"][1]["status"]["equals"]).toBe("In progress");
    expect(viewFilterRequestJSON(f({ property: "Status", op: "statusIsAnyOf", optionValues: [] }))).toBeNull();
  });

  it("select is / is not / any of use the select key", () => {
    expect(j(viewFilterRequestJSON(f({ property: "Priority", op: "selectIs", optionValues: ["High"] })))["select"]["equals"]).toBe("High");
    expect(j(viewFilterRequestJSON(f({ property: "Priority", op: "selectIsNot", optionValues: ["High"] })))["select"]["does_not_equal"]).toBe("High");
  });

  it("date is today / is before today / is empty use documented operator keys", () => {
    expect(j(viewFilterRequestJSON(f({ property: "Due", op: "dateIsToday" }), referenceDate))["date"]["equals"]).toBe("2026-09-28");
    expect(j(viewFilterRequestJSON(f({ property: "Due", op: "dateIsBeforeToday" }), referenceDate))["date"]["before"]).toBe("2026-09-28");
    expect(j(viewFilterRequestJSON(f({ property: "Due", op: "dateIsEmpty" })))["date"]["is_empty"]).toBe(true);
  });

  it("date is within next 7 days compounds on_or_after / on_or_before with AND", () => {
    const json = j(viewFilterRequestJSON(f({ property: "Due", op: "dateWithinNext7Days" }), referenceDate));
    expect(json["and"].length).toBe(2);
    expect(json["and"][0]["date"]["on_or_after"]).toBe("2026-09-28");
    expect(json["and"][1]["date"]["on_or_before"]).toBe("2026-10-05");
  });

  it("title contains, skipped when empty", () => {
    expect(j(viewFilterRequestJSON(f({ property: "Name", op: "titleContains", textValue: "urgent" })))["title"]["contains"]).toBe("urgent");
    expect(viewFilterRequestJSON(f({ property: "Name", op: "titleContains", textValue: "" }))).toBeNull();
    expect(viewFilterRequestJSON(f({ property: "Name", op: "titleContains" }))).toBeNull();
  });

  it("number greater than / less than", () => {
    expect(j(viewFilterRequestJSON(f({ property: "Score", op: "numberGreaterThan", numberValue: 5 })))["number"]["greater_than"]).toBe(5);
    expect(j(viewFilterRequestJSON(f({ property: "Score", op: "numberLessThan", numberValue: 10 })))["number"]["less_than"]).toBe(10);
    expect(viewFilterRequestJSON(f({ property: "Score", op: "numberGreaterThan" }))).toBeNull();
  });

  it("ViewQueryBuilder AND-combines multiple filters, passes a single filter through unwrapped", () => {
    const checkbox = f({ property: "Done", op: "checkboxIsNot" });
    const number = f({ property: "Score", op: "numberGreaterThan", numberValue: 3 });
    expect(j(filterJSON([checkbox]))["and"]).toBeUndefined();
    expect(j(filterJSON([checkbox, number]))["and"].length).toBe(2);
    expect(filterJSON([])).toBeNull();
    expect(filterJSON([f({ property: "Name", op: "titleContains" })])).toBeNull();
  });

  it("sorts JSON: property + direction, in given order", () => {
    const sorts: ViewSort[] = [
      { id: "s1", property: "Priority", ascending: false },
      { id: "s2", property: "Due", ascending: true },
    ];
    expect(sortsJSON(sorts)).toEqual([
      { property: "Priority", direction: "descending" },
      { property: "Due", direction: "ascending" },
    ]);
    expect(sortsJSON([])).toBeNull();
  });
});
