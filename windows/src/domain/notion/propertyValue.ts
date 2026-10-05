import { isObject, str, type JsonObject, type JsonValue } from "./json";
import { decodeRichTextItems, encodeText, plainText } from "./richText";

/**
 * A page property value in the cache/queue shape (title and rich_text are plain strings).
 * `unsupported` carries the original Notion type name in `rawType` and encodes as `{ type: rawType }`.
 */
export type PropertyValue =
  | { type: "title"; title: string }
  | { type: "rich_text"; rich_text: string }
  | { type: "checkbox"; checkbox: boolean }
  | { type: "status"; status?: { name: string } }
  | { type: "select"; select?: { name: string } }
  | { type: "date"; date?: { start: string; end?: string } }
  | { type: "number"; number?: number }
  | { type: "unsupported"; rawType: string };

export interface PropertyUpdate {
  name: string;
  value: PropertyValue;
}

function textField(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (Array.isArray(v)) return plainText(decodeRichTextItems(v));
  return typeof v === "string" ? v : "";
}

function optionName(v: unknown): { name: string } | undefined {
  if (!isObject(v)) return undefined;
  const name = str(v["name"]);
  return name === undefined ? undefined : { name };
}

/** Decodes either the Notion API shape or the cache/queue shape. */
export function decodePropertyValue(v: unknown): PropertyValue {
  if (!isObject(v)) throw new Error("PropertyValue must be an object");
  const type = str(v["type"]);
  if (type === undefined) throw new Error("PropertyValue is missing type");
  switch (type) {
    case "title":
      return { type, title: textField(v, "title") };
    case "rich_text":
      return { type, rich_text: textField(v, "rich_text") };
    case "checkbox":
      return { type, checkbox: v["checkbox"] === true };
    case "status": {
      const o = optionName(v["status"]);
      return o ? { type, status: o } : { type };
    }
    case "select": {
      const o = optionName(v["select"]);
      return o ? { type, select: o } : { type };
    }
    case "date": {
      const box = v["date"];
      const start = isObject(box) ? str(box["start"]) : undefined;
      if (!isObject(box) || start === undefined) return { type };
      const end = str(box["end"]);
      return { type, date: end === undefined ? { start } : { start, end } };
    }
    case "number": {
      const n = v["number"];
      return typeof n === "number" ? { type, number: n } : { type };
    }
    default:
      return { type: "unsupported", rawType: type };
  }
}

/** Swift `Codable` encoding (what `pending.json` and the row cache hold). */
export function encodePropertyValue(p: PropertyValue): JsonObject {
  switch (p.type) {
    case "title":
      return { type: "title", title: p.title };
    case "rich_text":
      return { type: "rich_text", rich_text: p.rich_text };
    case "checkbox":
      return { type: "checkbox", checkbox: p.checkbox };
    case "status":
      return p.status ? { type: "status", status: { name: p.status.name } } : { type: "status" };
    case "select":
      return p.select ? { type: "select", select: { name: p.select.name } } : { type: "select" };
    case "date":
      return p.date
        ? { type: "date", date: p.date.end === undefined ? { start: p.date.start } : { start: p.date.start, end: p.date.end } }
        : { type: "date" };
    case "number":
      return p.number === undefined ? { type: "number" } : { type: "number", number: p.number };
    case "unsupported":
      return { type: p.rawType };
  }
}

/** Request JSON for `PATCH /v1/pages/{id}`; `null` for unsupported values (no JSON). */
export function propertyRequestJSON(p: PropertyValue): JsonValue | null {
  switch (p.type) {
    case "title":
      return { type: "title", title: encodeText(p.title) };
    case "rich_text":
      return { type: "rich_text", rich_text: encodeText(p.rich_text) };
    case "checkbox":
      return { type: "checkbox", checkbox: p.checkbox };
    case "status":
      return { type: "status", status: p.status ? { name: p.status.name } : null };
    case "select":
      return { type: "select", select: p.select ? { name: p.select.name } : null };
    case "date": {
      if (!p.date) return { type: "date", date: null };
      const box: JsonObject = { start: p.date.start };
      if (p.date.end !== undefined) box["end"] = p.date.end;
      return { type: "date", date: box };
    }
    case "number":
      return { type: "number", number: p.number ?? null };
    case "unsupported":
      return null;
  }
}

export function decodePropertyUpdate(v: unknown): PropertyUpdate {
  if (!isObject(v)) throw new Error("PropertyUpdate must be an object");
  const name = str(v["name"]);
  if (name === undefined) throw new Error("PropertyUpdate is missing name");
  return { name, value: decodePropertyValue(v["value"]) };
}

export function encodePropertyUpdate(u: PropertyUpdate): JsonObject {
  return { name: u.name, value: encodePropertyValue(u.value) };
}
