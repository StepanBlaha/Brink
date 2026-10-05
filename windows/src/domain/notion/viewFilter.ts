import type { JsonObject, JsonValue } from "./json";

export const viewFilterOperators = [
  "checkboxIs", "checkboxIsNot", "statusIs", "statusIsNot", "statusIsAnyOf", "selectIs", "selectIsNot",
  "selectIsAnyOf", "dateIsToday", "dateIsBeforeToday", "dateWithinNext7Days", "dateIsEmpty", "titleContains",
  "numberGreaterThan", "numberLessThan",
] as const;
export type ViewFilterOperator = (typeof viewFilterOperators)[number];

export function operatorPropertyType(op: ViewFilterOperator): string {
  switch (op) {
    case "checkboxIs":
    case "checkboxIsNot":
      return "checkbox";
    case "statusIs":
    case "statusIsNot":
    case "statusIsAnyOf":
      return "status";
    case "selectIs":
    case "selectIsNot":
    case "selectIsAnyOf":
      return "select";
    case "dateIsToday":
    case "dateIsBeforeToday":
    case "dateWithinNext7Days":
    case "dateIsEmpty":
      return "date";
    case "titleContains":
      return "title";
    case "numberGreaterThan":
    case "numberLessThan":
      return "number";
  }
}

export function operatorsForPropertyType(type: string): ViewFilterOperator[] {
  return viewFilterOperators.filter((o) => operatorPropertyType(o) === type);
}

export function operatorDisplayName(op: ViewFilterOperator): string {
  switch (op) {
    case "checkboxIs":
    case "statusIs":
    case "selectIs":
      return "is";
    case "checkboxIsNot":
      return "isn't";
    case "statusIsNot":
    case "selectIsNot":
      return "is not";
    case "statusIsAnyOf":
    case "selectIsAnyOf":
      return "is any of";
    case "dateIsToday":
      return "is today";
    case "dateIsBeforeToday":
      return "is before today";
    case "dateWithinNext7Days":
      return "is within next 7 days";
    case "dateIsEmpty":
      return "is empty";
    case "titleContains":
      return "contains";
    case "numberGreaterThan":
      return "is greater than";
    case "numberLessThan":
      return "is less than";
  }
}

export function operatorNeedsValue(op: ViewFilterOperator): boolean {
  return !["dateIsToday", "dateIsBeforeToday", "dateWithinNext7Days", "dateIsEmpty"].includes(op);
}

export function operatorNeedsMultipleOptions(op: ViewFilterOperator): boolean {
  return op === "statusIsAnyOf" || op === "selectIsAnyOf";
}

/** One condition of a saved view. Same JSON shape as the Swift Codable struct (optionals omitted). */
export interface ViewFilter {
  id: string;
  property: string;
  op: ViewFilterOperator;
  textValue?: string;
  numberValue?: number;
  optionValues?: string[];
}

export interface ViewSort {
  id: string;
  property: string;
  ascending: boolean;
}

/** UTC calendar date, parity with `ISO8601DateFormatter` (plan section 9 item 6). */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Adds days on the local calendar (Swift `Calendar.current`), as the Mac does. */
function addLocalDays(d: Date, days: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + days);
  return r;
}

function propertyFilter(property: string, key: string, condition: JsonObject): JsonObject {
  return { property, [key]: condition };
}

function anyOf(f: ViewFilter, key: string): JsonValue | null {
  const names = f.optionValues;
  if (!names || names.length === 0) return null;
  if (names.length === 1) return propertyFilter(f.property, key, { equals: names[0] as string });
  return { or: names.map((n) => propertyFilter(f.property, key, { equals: n })) };
}

/** Notion data-source filter JSON for one condition, or `null` when a required value is missing. */
export function viewFilterRequestJSON(f: ViewFilter, referenceDate: Date = new Date()): JsonValue | null {
  const first = f.optionValues?.[0];
  switch (f.op) {
    case "checkboxIs":
      return propertyFilter(f.property, "checkbox", { equals: true });
    case "checkboxIsNot":
      return propertyFilter(f.property, "checkbox", { equals: false });
    case "statusIs":
      return first === undefined ? null : propertyFilter(f.property, "status", { equals: first });
    case "statusIsNot":
      return first === undefined ? null : propertyFilter(f.property, "status", { does_not_equal: first });
    case "statusIsAnyOf":
      return anyOf(f, "status");
    case "selectIs":
      return first === undefined ? null : propertyFilter(f.property, "select", { equals: first });
    case "selectIsNot":
      return first === undefined ? null : propertyFilter(f.property, "select", { does_not_equal: first });
    case "selectIsAnyOf":
      return anyOf(f, "select");
    case "dateIsToday":
      return propertyFilter(f.property, "date", { equals: isoDate(referenceDate) });
    case "dateIsBeforeToday":
      return propertyFilter(f.property, "date", { before: isoDate(referenceDate) });
    case "dateWithinNext7Days":
      return {
        and: [
          propertyFilter(f.property, "date", { on_or_after: isoDate(referenceDate) }),
          propertyFilter(f.property, "date", { on_or_before: isoDate(addLocalDays(referenceDate, 7)) }),
        ],
      };
    case "dateIsEmpty":
      return propertyFilter(f.property, "date", { is_empty: true });
    case "titleContains":
      return f.textValue ? propertyFilter(f.property, "title", { contains: f.textValue }) : null;
    case "numberGreaterThan":
      return f.numberValue === undefined ? null : propertyFilter(f.property, "number", { greater_than: f.numberValue });
    case "numberLessThan":
      return f.numberValue === undefined ? null : propertyFilter(f.property, "number", { less_than: f.numberValue });
  }
}

/** AND-combines filters, skipping any missing a required value; `null` when nothing remains. */
export function filterJSON(filters: ViewFilter[], referenceDate: Date = new Date()): JsonValue | null {
  const parts = filters.map((f) => viewFilterRequestJSON(f, referenceDate)).filter((p): p is JsonValue => p !== null);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0] as JsonValue;
  return { and: parts };
}

export function sortsJSON(sorts: ViewSort[]): JsonValue | null {
  if (sorts.length === 0) return null;
  return sorts.map((s) => ({ property: s.property, direction: s.ascending ? "ascending" : "descending" }));
}
