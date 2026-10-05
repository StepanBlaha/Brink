/** Plain JSON value, the TS counterpart of NotionKit's `JSONValue`. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function req(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== "string") throw new Error(`Missing string field "${key}"`);
  return v;
}

export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
