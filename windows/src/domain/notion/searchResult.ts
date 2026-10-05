import { decodeIcon, type Icon } from "./icon";
import { isObject, req, str } from "./json";
import { decodePropertyValue } from "./propertyValue";
import { decodeRichTextItems, plainText } from "./richText";

export interface SearchResult {
  id: string;
  kind: "page" | "dataSource";
  title: string;
  icon: Icon;
  url?: string;
}

export function decodeSearchResult(v: unknown): SearchResult {
  if (!isObject(v)) throw new Error("SearchResult must be an object");
  const kind = v["object"] === "data_source" ? "dataSource" : "page";
  let title = "";
  if (kind === "dataSource") {
    title = plainText(decodeRichTextItems(v["title"]));
  } else if (isObject(v["properties"])) {
    for (const p of Object.values(v["properties"])) {
      const value = decodePropertyValue(p);
      if (value.type === "title") {
        title = value.title;
        break;
      }
    }
  }
  const r: SearchResult = { id: req(v, "id"), kind, title, icon: decodeIcon(v["icon"]) };
  const url = str(v["url"]);
  if (url !== undefined) r.url = url;
  return r;
}

export function decodeSearchResults(v: unknown): SearchResult[] {
  const results = isObject(v) ? v["results"] : v;
  return Array.isArray(results) ? results.map(decodeSearchResult) : [];
}
