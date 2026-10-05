import type { JsonValue } from "../../domain/notion/json";
import { doneStatusOptionNames, type DataSourceSchema } from "../../domain/notion/dataSourceSchema";
import { filterJSON, sortsJSON } from "../../domain/notion/viewFilter";
import type { DatabaseConfig } from "../../domain/store/pin";

/** Done filter (omitted with showDone) AND the saved filters; `null` when nothing remains. */
export function buildFilter(config: DatabaseConfig | null, showDone: boolean, now: Date = new Date()): JsonValue | null {
  const parts: JsonValue[] = [];
  if (config && !showDone) {
    if (config.doneKind === "checkbox") {
      parts.push({ property: config.doneProperty, checkbox: { equals: false } });
    } else if (config.doneValue !== undefined) {
      parts.push({ property: config.doneProperty, status: { does_not_equal: config.doneValue } });
    }
  }
  const extra = config?.filters ? filterJSON(config.filters, now) : null;
  if (extra) parts.push(extra);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0] as JsonValue;
  return { and: parts };
}

/** Saved sorts, else date ascending, else `created_time` descending. */
export function buildSorts(config: DatabaseConfig | null): JsonValue {
  const saved = config?.sorts ? sortsJSON(config.sorts) : null;
  if (saved) return saved;
  if (config?.dateProperty) return [{ property: config.dateProperty, direction: "ascending" }];
  return [{ timestamp: "created_time", direction: "descending" }];
}

/**
 * Embedded databases: done = first checkbox, else a status property whose option is in a done group or named
 * Done/Completed/Hotovo; date = first date property. Neither done kind: read-only (`null`).
 */
export function inferConfig(schema: DataSourceSchema): DatabaseConfig | null {
  const date = schema.properties.find((p) => p.type === "date")?.name;
  const checkbox = schema.properties.find((p) => p.type === "checkbox");
  if (checkbox) {
    const c: DatabaseConfig = { doneProperty: checkbox.name, doneKind: "checkbox", showDone: false };
    if (date) c.dateProperty = date;
    return c;
  }
  const status = schema.properties.find((p) => p.type === "status");
  if (status) {
    const c: DatabaseConfig = { doneProperty: status.name, doneKind: "status", showDone: false };
    const doneValue = doneStatusOptionNames(status)[0];
    if (doneValue !== undefined) c.doneValue = doneValue;
    if (date) c.dateProperty = date;
    return c;
  }
  return null;
}
