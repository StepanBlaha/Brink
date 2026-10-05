import type { DataSourceSchema, PropertySchema } from "../../domain/notion/dataSourceSchema";
import {
  operatorsForPropertyType, operatorPropertyType, type ViewFilter, type ViewSort,
} from "../../domain/notion/viewFilter";
import { FILTER_TYPES, SORT_TYPES } from "./pinning";

export const filterProperties = (s: DataSourceSchema): PropertySchema[] => s.properties.filter((p) => FILTER_TYPES.has(p.type));
export const sortProperties = (s: DataSourceSchema): PropertySchema[] => s.properties.filter((p) => SORT_TYPES.has(p.type));

export function newFilter(s: DataSourceSchema, id: string = crypto.randomUUID()): ViewFilter | null {
  const p = filterProperties(s)[0];
  if (!p) return null;
  return { id, property: p.name, op: operatorsForPropertyType(p.type)[0] ?? "titleContains" };
}

export function newSort(s: DataSourceSchema, id: string = crypto.randomUUID()): ViewSort | null {
  const p = sortProperties(s)[0];
  return p ? { id, property: p.name, ascending: true } : null;
}

/** Changing the property resets the operator and every value (changeProperty). */
export function changeFilterProperty(f: ViewFilter, p: PropertySchema): ViewFilter {
  if (f.property === p.name) return f;
  return { id: f.id, property: p.name, op: operatorsForPropertyType(p.type)[0] ?? f.op };
}

export function changeFilterOperator(f: ViewFilter, op: ViewFilter["op"]): ViewFilter {
  const first = f.optionValues?.[0];
  const multiple = op === "statusIsAnyOf" || op === "selectIsAnyOf";
  return !multiple && first !== undefined ? { ...f, op, optionValues: [first] } : { ...f, op };
}

/** Single-choice operators keep one option (click again to clear); any-of toggles membership. */
export function toggleFilterOption(f: ViewFilter, name: string, multiple: boolean): ViewFilter {
  const values = f.optionValues ?? [];
  if (multiple) {
    return { ...f, optionValues: values.includes(name) ? values.filter((v) => v !== name) : [...values, name] };
  }
  return { ...f, optionValues: values.length === 1 && values[0] === name ? [] : [name] };
}

/** Operators offered for a filter; falls back to the operator's own property type. */
export function operatorsFor(s: DataSourceSchema, f: ViewFilter) {
  const type = s.properties.find((p) => p.name === f.property)?.type ?? operatorPropertyType(f.op);
  return operatorsForPropertyType(type);
}

/** Parses number input that keeps partial text like "1." alive; comma works as the decimal mark. */
export function parseNumber(text: string): number | undefined {
  const t = text.trim().replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
