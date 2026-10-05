import type { Icon } from "../notion/icon";
import { arr, isObject, str, type JsonObject } from "../notion/json";
import type { ViewFilter, ViewFilterOperator, ViewSort } from "../notion/viewFilter";
import { viewFilterOperators } from "../notion/viewFilter";

export type PinKind = "page" | "dataSource";
export type DoneKind = "checkbox" | "status";

/** Swift synthesized enum shape: `{"emoji":{"_0":"x"}}`, `{"url":{"_0":"u"}}`, `{"none":{}}`. */
export type PinIcon = { emoji: { _0: string } } | { url: { _0: string } } | { none: Record<string, never> };

export type CustomIcon =
  | { kind: "emoji"; value: string }
  | { kind: "sfSymbol"; name: string; colorHex: number }
  | { kind: "letter"; value: string; colorHex: number }
  | { kind: "lucide"; name: string; colorHex: number };

export interface DatabaseConfig {
  doneProperty: string;
  doneKind: DoneKind;
  doneValue?: string;
  dateProperty?: string;
  showDone: boolean;
  filters?: ViewFilter[];
  sorts?: ViewSort[];
  viewName?: string;
}

export interface Pin {
  id: string;
  notionId: string;
  kind: PinKind;
  title: string;
  icon: PinIcon;
  order: number;
  config?: DatabaseConfig;
  customIcon?: CustomIcon;
  /** Absent = ungrouped. */
  groupId?: string;
}

export interface PinGroup {
  id: string;
  name: string;
  emoji?: string;
  order: number;
}

export const pinIconNone: PinIcon = { none: {} };

/** `PinIcon.init(Icon)`: external and file both become url. */
export function pinIconFrom(icon: Icon): PinIcon {
  switch (icon.type) {
    case "emoji":
      return { emoji: { _0: icon.emoji } };
    case "external":
    case "file":
      return { url: { _0: icon.url } };
    case "none":
      return pinIconNone;
  }
}

function decodePinIcon(v: unknown): PinIcon {
  if (isObject(v)) {
    const e = v["emoji"];
    if (isObject(e) && typeof e["_0"] === "string") return { emoji: { _0: e["_0"] } };
    const u = v["url"];
    if (isObject(u) && typeof u["_0"] === "string") return { url: { _0: u["_0"] } };
  }
  return pinIconNone;
}

function decodeCustomIcon(v: unknown): CustomIcon | undefined {
  if (!isObject(v)) return undefined;
  const hex = typeof v["colorHex"] === "number" ? v["colorHex"] : undefined;
  const value = str(v["value"]);
  const name = str(v["name"]);
  switch (v["kind"]) {
    case "emoji":
      return value === undefined ? undefined : { kind: "emoji", value };
    case "sfSymbol":
      return name === undefined || hex === undefined ? undefined : { kind: "sfSymbol", name, colorHex: hex };
    case "letter":
      return value === undefined || hex === undefined ? undefined : { kind: "letter", value, colorHex: hex };
    case "lucide":
      return name === undefined || hex === undefined ? undefined : { kind: "lucide", name, colorHex: hex };
    default:
      return undefined;
  }
}

function decodeFilters(v: unknown): ViewFilter[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: ViewFilter[] = [];
  for (const o of v) {
    if (!isObject(o)) continue;
    const id = str(o["id"]);
    const property = str(o["property"]);
    const op = o["op"];
    if (id === undefined || property === undefined || !(viewFilterOperators as readonly unknown[]).includes(op)) continue;
    const f: ViewFilter = { id, property, op: op as ViewFilterOperator };
    if (typeof o["textValue"] === "string") f.textValue = o["textValue"];
    if (typeof o["numberValue"] === "number") f.numberValue = o["numberValue"];
    if (Array.isArray(o["optionValues"])) f.optionValues = o["optionValues"].filter((x): x is string => typeof x === "string");
    out.push(f);
  }
  return out;
}

function decodeSorts(v: unknown): ViewSort[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObject).flatMap((o) => {
    const id = str(o["id"]);
    const property = str(o["property"]);
    return id !== undefined && property !== undefined && typeof o["ascending"] === "boolean"
      ? [{ id, property, ascending: o["ascending"] }]
      : [];
  });
}

function decodeConfig(v: unknown): DatabaseConfig | undefined {
  if (!isObject(v)) return undefined;
  const doneProperty = str(v["doneProperty"]);
  const doneKind = v["doneKind"];
  if (doneProperty === undefined || (doneKind !== "checkbox" && doneKind !== "status")) return undefined;
  const c: DatabaseConfig = { doneProperty, doneKind, showDone: v["showDone"] === true };
  if (typeof v["doneValue"] === "string") c.doneValue = v["doneValue"];
  if (typeof v["dateProperty"] === "string") c.dateProperty = v["dateProperty"];
  const filters = decodeFilters(v["filters"]);
  if (filters) c.filters = filters;
  const sorts = decodeSorts(v["sorts"]);
  if (sorts) c.sorts = sorts;
  if (typeof v["viewName"] === "string") c.viewName = v["viewName"];
  return c;
}

/** Tolerant: old pins.json files lack `customIcon` / `groupId` / filters. Throws on an unusable pin. */
export function decodePin(v: unknown): Pin {
  if (!isObject(v)) throw new Error("Pin must be an object");
  const id = str(v["id"]);
  const notionId = str(v["notionId"]);
  const title = str(v["title"]);
  const kind = v["kind"];
  if (id === undefined || notionId === undefined || title === undefined || (kind !== "page" && kind !== "dataSource")) {
    throw new Error("Invalid pin");
  }
  const pin: Pin = { id, notionId, kind, title, icon: decodePinIcon(v["icon"]), order: typeof v["order"] === "number" ? v["order"] : 0 };
  const config = decodeConfig(v["config"]);
  if (config) pin.config = config;
  const customIcon = decodeCustomIcon(v["customIcon"]);
  if (customIcon) pin.customIcon = customIcon;
  if (typeof v["groupId"] === "string") pin.groupId = v["groupId"];
  return pin;
}

export function encodePin(p: Pin): JsonObject {
  // Plain object spread keeps optional keys omitted when absent (Swift omits nil).
  return JSON.parse(JSON.stringify(p)) as JsonObject;
}

export function sortByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order);
}

/** Corrupt file decodes to empty; sorted by order like PinStore.load. */
export function decodePins(v: unknown): Pin[] {
  try {
    return sortByOrder(arr(v).map(decodePin));
  } catch {
    return [];
  }
}

export function encodePins(pins: Pin[]): JsonObject[] {
  return sortByOrder(pins).map(encodePin);
}

export function decodeGroup(v: unknown): PinGroup {
  if (!isObject(v)) throw new Error("PinGroup must be an object");
  const id = str(v["id"]);
  const name = str(v["name"]);
  if (id === undefined || name === undefined) throw new Error("Invalid group");
  const g: PinGroup = { id, name, order: typeof v["order"] === "number" ? v["order"] : 0 };
  if (typeof v["emoji"] === "string") g.emoji = v["emoji"];
  return g;
}

export function decodeGroups(v: unknown): PinGroup[] {
  try {
    return sortByOrder(arr(v).map(decodeGroup));
  } catch {
    return [];
  }
}

export function encodeGroups(groups: PinGroup[]): JsonObject[] {
  return sortByOrder(groups).map((g) => JSON.parse(JSON.stringify(g)) as JsonObject);
}
