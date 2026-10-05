import { describe, expect, it } from "vitest";
import { decodeDataSourceSchema } from "../../domain/notion/dataSourceSchema";
import type { SearchResult } from "../../domain/notion/searchResult";
import type { Pin } from "../../domain/store/pin";
import schemaJson from "../../../fixtures/data-source-schema.json";
import {
  baseTitle, canSave, configToForm, databaseToPin, emptyForm, formToConfig, pageToPin, retitled,
} from "./pinning";
import {
  changeFilterOperator, changeFilterProperty, filterProperties, newFilter, operatorsFor, parseNumber, sortProperties,
  toggleFilterOption,
} from "./viewBuilderModel";

const schema = decodeDataSourceSchema(schemaJson);
const id = (n: string) => schema.properties.find((p) => p.name === n)?.id ?? "";
const result = (over: Partial<SearchResult> = {}): SearchResult => ({
  id: "n1", kind: "page", title: "Tasks", icon: { type: "emoji", emoji: "✅" }, ...over,
});

describe("pins from search results", () => {
  it("a page pin keeps the emoji and falls back to Untitled", () => {
    expect(pageToPin(result(), "p").icon).toEqual({ emoji: { _0: "✅" } });
    expect(pageToPin(result({ title: "" }), "p").title).toBe("Untitled");
  });
  it("a database pin is titled Base · View and keeps the config", () => {
    const cfg = { doneProperty: "Done", doneKind: "checkbox" as const, showDone: false, viewName: "This week" };
    const pin = databaseToPin(result({ kind: "dataSource" }), cfg, "p");
    expect(pin).toMatchObject({ kind: "dataSource", title: "Tasks · This week", config: cfg });
    expect(databaseToPin(result(), { doneProperty: "Done", doneKind: "checkbox", showDone: false }, "p").title).toBe("Tasks");
  });
  it("editing the view renames the pin from its base title", () => {
    const pin = { ...databaseToPin(result(), { doneProperty: "Done", doneKind: "checkbox", showDone: false, viewName: "A" }, "p") } as Pin;
    expect(baseTitle(pin.title)).toBe("Tasks");
    expect(retitled(pin, { ...pin.config!, viewName: "B" }).title).toBe("Tasks · B");
    expect(retitled(pin, { doneProperty: "Done", doneKind: "checkbox", showDone: false }).title).toBe("Tasks");
  });
});

describe("database setup form", () => {
  it("needs a done property, and a done option for status", () => {
    expect(canSave(schema, emptyForm)).toBe(false);
    expect(canSave(schema, { ...emptyForm, doneId: id("Done") })).toBe(true);
    expect(canSave(schema, { ...emptyForm, doneId: id("Status") })).toBe(false);
    expect(canSave(schema, { ...emptyForm, doneId: id("Status"), doneStatus: "Done" })).toBe(true);
  });
  it("stores names, omits empty lists and blank view names", () => {
    const cfg = formToConfig(schema, { ...emptyForm, doneId: id("Status"), doneStatus: "Done", dateId: id("Due"), viewName: "  " });
    expect(cfg).toEqual({ doneProperty: "Status", doneKind: "status", doneValue: "Done", dateProperty: "Due", showDone: false });
    const checkbox = formToConfig(schema, { ...emptyForm, doneId: id("Done"), doneStatus: "ignored", viewName: " Today ", showDone: true });
    expect(checkbox).toEqual({ doneProperty: "Done", doneKind: "checkbox", showDone: true, viewName: "Today" });
  });
  it("round-trips through configToForm", () => {
    const f = newFilter(schema, "f1")!;
    const form = { ...emptyForm, doneId: id("Status"), doneStatus: "Done", dateId: id("Due"), viewName: "V", filters: [f], showDone: true };
    const back = configToForm(schema, formToConfig(schema, form)!);
    expect(back).toEqual(form);
  });
});

describe("view builder", () => {
  it("offers the property types the Mac offers", () => {
    expect(filterProperties(schema).map((p) => p.type)).not.toContain("rich_text");
    expect(sortProperties(schema).length).toBeGreaterThan(0);
  });
  it("a new filter starts on the first property's first operator", () => {
    const first = filterProperties(schema)[0]!;
    expect(newFilter(schema, "f")).toEqual({ id: "f", property: first.name, op: operatorsFor(schema, { id: "x", property: first.name, op: "titleContains" })[0] });
  });
  it("changing the property resets operator and values", () => {
    const f = { id: "f", property: "Status", op: "statusIsAnyOf" as const, optionValues: ["Done"] };
    const g = changeFilterProperty(f, schema.properties.find((p) => p.name === "Done")!);
    expect(g).toEqual({ id: "f", property: "Done", op: "checkboxIs" });
    expect(changeFilterProperty(f, schema.properties.find((p) => p.name === "Status")!)).toBe(f);
  });
  it("narrowing to a single-choice operator keeps one option", () => {
    const f = { id: "f", property: "Status", op: "statusIsAnyOf" as const, optionValues: ["A", "B"] };
    expect(changeFilterOperator(f, "statusIs").optionValues).toEqual(["A"]);
    expect(changeFilterOperator(f, "statusIsNot").op).toBe("statusIsNot");
  });
  it("toggles options: single keeps one and clears on repeat, any-of is a set", () => {
    const f = { id: "f", property: "Status", op: "statusIs" as const };
    const one = toggleFilterOption(f, "A", false);
    expect(one.optionValues).toEqual(["A"]);
    expect(toggleFilterOption(toggleFilterOption(one, "B", false), "B", false).optionValues).toEqual([]);
    const many = toggleFilterOption(toggleFilterOption(f, "A", true), "B", true);
    expect(many.optionValues).toEqual(["A", "B"]);
    expect(toggleFilterOption(many, "A", true).optionValues).toEqual(["B"]);
  });
  it("lists operators of the property's type", () => {
    expect(operatorsFor(schema, { id: "f", property: "Due", op: "dateIsToday" })).toContain("dateIsEmpty");
  });
  it("parses numbers with a comma and keeps partial input undefined", () => {
    expect(parseNumber("1,5")).toBe(1.5);
    expect(parseNumber("1.")).toBe(1);
    expect(parseNumber("")).toBeUndefined();
    expect(parseNumber("x")).toBeUndefined();
  });
});
