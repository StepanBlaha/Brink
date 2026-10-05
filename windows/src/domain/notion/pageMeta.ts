import { decodeIcon, type Icon } from "./icon";
import { isObject, req, str } from "./json";

/** A Notion file object (cover/icon). Notion-hosted URLs expire and must be re-fetched. */
export interface FileRef {
  url: string;
  expires: boolean;
}

export function decodeFileRef(v: unknown): FileRef {
  if (!isObject(v)) throw new Error("FileRef must be an object");
  const box = (k: string): string => {
    const o = v[k];
    const url = isObject(o) ? str(o["url"]) : undefined;
    if (url === undefined) throw new Error(`FileRef missing ${k}.url`);
    return url;
  };
  switch (str(v["type"])) {
    case "external":
      return { url: box("external"), expires: false };
    case "file":
      return { url: box("file"), expires: true };
    case "file_upload":
      return { url: box("file_upload"), expires: true };
    default:
      throw new Error(`Unsupported file type ${String(v["type"])}`);
  }
}

export interface PageMeta {
  id: string;
  cover?: FileRef;
  icon?: Icon;
}

export function decodePageMeta(v: unknown): PageMeta {
  if (!isObject(v)) throw new Error("PageMeta must be an object");
  const meta: PageMeta = { id: req(v, "id") };
  // Errors in cover/icon are swallowed (`try?` in Swift).
  try {
    if (v["cover"] != null) meta.cover = decodeFileRef(v["cover"]);
  } catch {
    /* ignore */
  }
  if (v["icon"] != null) meta.icon = decodeIcon(v["icon"]);
  return meta;
}
