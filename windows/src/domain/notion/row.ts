import { decodeIcon, encodeIcon, type Icon } from "./icon";
import { isObject, req, str, type JsonObject } from "./json";
import { decodePropertyValue, encodePropertyValue, type PropertyValue } from "./propertyValue";

export interface Row {
  id: string;
  url?: string;
  icon: Icon;
  /** The (first) title property's text. */
  title: string;
  properties: Record<string, PropertyValue>;
}

export function firstTitle(properties: Record<string, PropertyValue>): string {
  for (const p of Object.values(properties)) if (p.type === "title") return p.title;
  return "";
}

/** Decodes a Notion page object or a cached row (same decoder, as in Row.swift). */
export function decodeRow(v: unknown): Row {
  if (!isObject(v)) throw new Error("Row must be an object");
  const properties: Record<string, PropertyValue> = {};
  const raw = v["properties"];
  if (isObject(raw)) for (const [k, p] of Object.entries(raw)) properties[k] = decodePropertyValue(p);
  const row: Row = { id: req(v, "id"), icon: decodeIcon(v["icon"]), title: firstTitle(properties), properties };
  const url = str(v["url"]);
  if (url !== undefined) row.url = url;
  return row;
}

export function encodeRow(r: Row): JsonObject {
  const properties: JsonObject = {};
  for (const [k, p] of Object.entries(r.properties)) properties[k] = encodePropertyValue(p);
  const o: JsonObject = { id: r.id };
  if (r.url !== undefined) o["url"] = r.url;
  o["icon"] = encodeIcon(r.icon);
  o["properties"] = properties;
  return o;
}

export interface QueryPage {
  rows: Row[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Decodes one `POST /data_sources/{id}/query` response page. */
export function decodeQueryPage(v: unknown): QueryPage {
  if (!isObject(v)) throw new Error("Query response must be an object");
  const results = Array.isArray(v["results"]) ? v["results"] : [];
  return {
    rows: results.map(decodeRow),
    nextCursor: str(v["next_cursor"]) ?? null,
    hasMore: v["has_more"] === true,
  };
}

/** Rows from either a bare array or a `{ results }` list response. */
export function decodeRows(v: unknown): Row[] {
  const results = Array.isArray(v) ? v : isObject(v) && Array.isArray(v["results"]) ? v["results"] : [];
  return results.map(decodeRow);
}
