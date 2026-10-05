import { arr, isObject, req, str } from "./json";
import { decodeRichTextItems, plainText } from "./richText";

export interface SelectOption {
  id: string;
  name: string;
  color: string;
}

export interface StatusGroup {
  name: string;
  optionIds: string[];
}

export interface PropertySchema {
  id: string;
  name: string;
  type: string;
  selectOptions?: SelectOption[];
  statusOptions?: SelectOption[];
  statusGroups?: StatusGroup[];
}

export interface DataSourceSchema {
  id: string;
  name: string;
  properties: PropertySchema[];
}

const doneWords = new Set(["done", "completed", "hotovo", "complete"]);

/** Names of the status options that mean "done" (Complete group first, then by name). */
export function doneStatusOptionNames(p: PropertySchema): string[] {
  const groups = p.statusGroups;
  if (groups && groups.length > 0) {
    const ids = new Set(groups.filter((g) => doneWords.has(g.name.toLowerCase())).flatMap((g) => g.optionIds));
    if (ids.size > 0) return (p.statusOptions ?? []).filter((o) => ids.has(o.id)).map((o) => o.name);
  }
  return (p.statusOptions ?? []).filter((o) => doneWords.has(o.name.toLowerCase())).map((o) => o.name);
}

function decodeOptions(v: unknown): SelectOption[] {
  return arr(v).filter(isObject).map((o) => ({ id: req(o, "id"), name: req(o, "name"), color: req(o, "color") }));
}

export function decodeDataSourceSchema(v: unknown): DataSourceSchema {
  if (!isObject(v)) throw new Error("DataSourceSchema must be an object");
  const name = str(v["name"]) ?? plainText(decodeRichTextItems(v["title"]));
  const properties: PropertySchema[] = [];
  if (isObject(v["properties"])) {
    for (const [propName, raw] of Object.entries(v["properties"])) {
      if (!isObject(raw)) continue;
      const p: PropertySchema = { id: req(raw, "id"), name: propName, type: req(raw, "type") };
      if (isObject(raw["select"])) p.selectOptions = decodeOptions(raw["select"]["options"]);
      if (isObject(raw["status"])) {
        p.statusOptions = decodeOptions(raw["status"]["options"]);
        const groups = arr(raw["status"]["groups"]).filter(isObject).map((g) => ({
          name: req(g, "name"),
          optionIds: arr(g["option_ids"]).filter((x): x is string => typeof x === "string"),
        }));
        if (groups.length > 0) p.statusGroups = groups;
      }
      properties.push(p);
    }
  }
  properties.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { id: req(v, "id"), name, properties };
}
