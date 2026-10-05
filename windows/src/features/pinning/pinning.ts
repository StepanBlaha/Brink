import type { DataSourceSchema, PropertySchema } from "../../domain/notion/dataSourceSchema";
import type { SearchResult } from "../../domain/notion/searchResult";
import { pinIconFrom, type DatabaseConfig, type Pin } from "../../domain/store/pin";
import type { ViewFilter, ViewSort } from "../../domain/notion/viewFilter";

const SEPARATOR = " · ";

/** A page pin; the store assigns `order` (max + 1). */
export function pageToPin(result: SearchResult, id: string = crypto.randomUUID()): Pin {
  return { id, notionId: result.id, kind: "page", title: result.title === "" ? "Untitled" : result.title, icon: pinIconFrom(result.icon), order: 0 };
}

/** A database pin titled `Base · View name` when the view is named (finishPinningDatabase). */
export function databaseToPin(result: SearchResult, config: DatabaseConfig, id: string = crypto.randomUUID()): Pin {
  const base = result.title === "" ? "Untitled" : result.title;
  const title = config.viewName ? `${base}${SEPARATOR}${config.viewName}` : base;
  return { id, notionId: result.id, kind: "dataSource", title, icon: pinIconFrom(result.icon), order: 0, config };
}

/** The pin title without its view suffix. */
export function baseTitle(title: string): string {
  return title.split(SEPARATOR)[0] ?? title;
}

/** Titles of an edited pin: view suffix follows the new view name. */
export function retitled(pin: Pin, config: DatabaseConfig): Pin {
  const base = baseTitle(pin.title);
  return { ...pin, config, title: config.viewName ? `${base}${SEPARATOR}${config.viewName}` : base };
}

export const doneCandidates = (s: DataSourceSchema | null): PropertySchema[] =>
  (s?.properties ?? []).filter((p) => p.type === "checkbox" || p.type === "status");
export const dateCandidates = (s: DataSourceSchema | null): PropertySchema[] =>
  (s?.properties ?? []).filter((p) => p.type === "date");

export const FILTER_TYPES = new Set(["checkbox", "status", "select", "date", "title", "number"]);
export const SORT_TYPES = new Set([
  "title", "date", "number", "select", "status", "checkbox", "rich_text", "created_time", "last_edited_time",
]);

/** What the setup form holds before it becomes a `DatabaseConfig`. */
export interface SetupForm {
  doneId: string | null;
  doneStatus: string | null;
  dateId: string | null;
  viewName: string;
  filters: ViewFilter[];
  sorts: ViewSort[];
  showDone: boolean;
}

export const emptyForm: SetupForm = {
  doneId: null, doneStatus: null, dateId: null, viewName: "", filters: [], sorts: [], showDone: false,
};

export function canSave(schema: DataSourceSchema | null, f: SetupForm): boolean {
  const done = schema?.properties.find((p) => p.id === f.doneId);
  if (!done) return false;
  return done.type === "status" ? f.doneStatus !== null : true;
}

/** `DatabaseSetupView.save`: names (not ids) are stored; empty lists and blank names are omitted. */
export function formToConfig(schema: DataSourceSchema, f: SetupForm): DatabaseConfig | null {
  const done = schema.properties.find((p) => p.id === f.doneId);
  if (!done) return null;
  const kind = done.type === "status" ? "status" : "checkbox";
  const config: DatabaseConfig = { doneProperty: done.name, doneKind: kind, showDone: f.showDone };
  if (kind === "status" && f.doneStatus !== null) config.doneValue = f.doneStatus;
  const date = schema.properties.find((p) => p.id === f.dateId);
  if (date) config.dateProperty = date.name;
  if (f.filters.length > 0) config.filters = f.filters;
  if (f.sorts.length > 0) config.sorts = f.sorts;
  const name = f.viewName.trim();
  if (name !== "") config.viewName = name;
  return config;
}

/** Prefill when editing a pin's view (DatabaseSetupView.prefill). */
export function configToForm(schema: DataSourceSchema, c: DatabaseConfig): SetupForm {
  const byName = (name: string | undefined, types: string[]) =>
    schema.properties.find((p) => p.name === name && types.includes(p.type))?.id ?? null;
  return {
    doneId: byName(c.doneProperty, ["checkbox", "status"]),
    doneStatus: c.doneValue ?? null,
    dateId: byName(c.dateProperty, ["date"]),
    viewName: c.viewName ?? "",
    filters: c.filters ?? [],
    sorts: c.sorts ?? [],
    showDone: c.showDone,
  };
}
