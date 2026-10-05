/** The Notion block kind one editor paragraph maps to (port of ParagraphKind). */
export type ParagraphKind =
  | { t: "paragraph" }
  | { t: "heading1" }
  | { t: "heading2" }
  | { t: "heading3" }
  | { t: "bulleted" }
  | { t: "numbered" }
  | { t: "toDo"; checked: boolean }
  | { t: "quote" }
  | { t: "code"; language: string }
  | { t: "divider" }
  | { t: "toggle" }
  | { t: "callout"; icon: string }
  | { t: "token"; type: string; title: string }
  | { t: "image"; source: string };

export const defaultCalloutIcon = "💡";

export const K = {
  paragraph: { t: "paragraph" } as ParagraphKind,
  heading1: { t: "heading1" } as ParagraphKind,
  heading2: { t: "heading2" } as ParagraphKind,
  heading3: { t: "heading3" } as ParagraphKind,
  bulleted: { t: "bulleted" } as ParagraphKind,
  numbered: { t: "numbered" } as ParagraphKind,
  quote: { t: "quote" } as ParagraphKind,
  divider: { t: "divider" } as ParagraphKind,
  toggle: { t: "toggle" } as ParagraphKind,
  toDo: (checked = false): ParagraphKind => ({ t: "toDo", checked }),
  code: (language = "plain text"): ParagraphKind => ({ t: "code", language }),
  callout: (icon: string = defaultCalloutIcon): ParagraphKind => ({ t: "callout", icon }),
  token: (type: string, title = ""): ParagraphKind => ({ t: "token", type, title }),
  image: (source: string): ParagraphKind => ({ t: "image", source }),
};

export function kindEquals(a: ParagraphKind, b: ParagraphKind): boolean {
  if (a.t !== b.t) return false;
  switch (a.t) {
    case "toDo": return a.checked === (b as typeof a).checked;
    case "code": return a.language === (b as typeof a).language;
    case "callout": return a.icon === (b as typeof a).icon;
    case "token": return a.type === (b as typeof a).type && a.title === (b as typeof a).title;
    case "image": return a.source === (b as typeof a).source;
    default: return true;
  }
}

const apiTypes: Record<string, string> = {
  paragraph: "paragraph", heading1: "heading_1", heading2: "heading_2", heading3: "heading_3",
  bulleted: "bulleted_list_item", numbered: "numbered_list_item", toDo: "to_do", quote: "quote",
  code: "code", divider: "divider", toggle: "toggle", callout: "callout", image: "image",
};

/** The Notion API block type name. */
export function apiType(k: ParagraphKind): string {
  return k.t === "token" ? k.type : apiTypes[k.t]!;
}

export const isImage = (k: ParagraphKind): boolean => k.t === "image";
export const isToken = (k: ParagraphKind): boolean => k.t === "token";

/** Whether the editor nests indented paragraphs under a block of this kind. */
export function canHaveChildren(k: ParagraphKind): boolean {
  return ["paragraph", "bulleted", "numbered", "toDo", "quote", "toggle", "callout"].includes(k.t);
}

/** Whether the kind has editable rich text. */
export function hasText(k: ParagraphKind): boolean {
  return k.t !== "divider" && k.t !== "token" && k.t !== "image";
}

/** Short tag stored in the `kind` node attribute. */
export function kindTag(k: ParagraphKind): string {
  switch (k.t) {
    case "toDo": return k.checked ? "to_do:checked" : "to_do";
    case "code": return `code:${k.language}`;
    case "callout": return `callout:${k.icon}`;
    case "token": return `token:${k.type}`;
    case "image": return `image:${k.source}`;
    default: return apiType(k);
  }
}

const tagMap: Record<string, ParagraphKind> = {
  paragraph: K.paragraph, heading_1: K.heading1, heading_2: K.heading2, heading_3: K.heading3,
  bulleted_list_item: K.bulleted, numbered_list_item: K.numbered, to_do: K.toDo(false),
  "to_do:checked": K.toDo(true), quote: K.quote, divider: K.divider, toggle: K.toggle,
};

/** Parses a tag (tokens come back with an empty title). */
export function kindFromTag(tag: string): ParagraphKind | undefined {
  const m = tagMap[tag];
  if (m) return m;
  if (tag.startsWith("code:")) return K.code(tag.slice(5));
  if (tag.startsWith("callout:")) return K.callout(tag.slice(8));
  if (tag.startsWith("image:")) return K.image(tag.slice(6));
  if (tag.startsWith("token:")) return K.token(tag.slice(6), "");
  return undefined;
}

/** ImageSource.encoded: "file:URL", "external:URL" or "upload:ID". */
export type ImageSource = { t: "file" | "external"; url: string } | { t: "upload"; id: string };

export function imageSourceEncoded(s: ImageSource): string {
  return s.t === "upload" ? `upload:${s.id}` : `${s.t}:${s.url}`;
}

export function parseImageSource(encoded: string): ImageSource | undefined {
  if (encoded.startsWith("file:")) return { t: "file", url: encoded.slice(5) };
  if (encoded.startsWith("external:")) return { t: "external", url: encoded.slice(9) };
  if (encoded.startsWith("upload:")) return { t: "upload", id: encoded.slice(7) };
  return undefined;
}

export const imageSourceUrl = (s: ImageSource | undefined): string | undefined => (s && s.t !== "upload" ? s.url : undefined);
