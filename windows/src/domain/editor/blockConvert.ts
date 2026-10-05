import { blockPlainText, type Block } from "../notion/block";
import type { BlockUpdate, NewBlock } from "../notion/newBlock";
import type { RichTextSpan } from "../notion/richText";
import { defaultCalloutIcon, K, kindEquals, parseImageSource, type ParagraphKind } from "../markdown/paragraphKind";
import { sendableLanguage, normalizeLanguage } from "../markdown/paragraphSyntax";
import { normalize } from "../markdown/spanRuns";
import type { DocParagraph } from "./types";


/** The editor kind of a server block (PageEditorEngine.kind(of:)). */
export function kindOfBlock(block: Block): ParagraphKind {
  const t = block.type;
  switch (t.kind) {
    case "paragraph": return K.paragraph;
    case "heading1": return K.heading1;
    case "heading2": return K.heading2;
    case "heading3": return K.heading3;
    case "toDo": return K.toDo(t.checked);
    case "bulletedListItem": return K.bulleted;
    case "numberedListItem": return K.numbered;
    case "quote": return K.quote;
    case "code": return K.code(normalizeLanguage(t.language));
    case "divider": return K.divider;
    case "toggle": return K.toggle;
    case "callout": {
      const icon = block.icon;
      if (icon?.type === "emoji") return K.callout(icon.emoji);
      if (icon === undefined || icon.type === "none") return K.callout(defaultCalloutIcon);
      return K.callout(""); // external/file icon: kept untouched in Notion
    }
    case "childDatabase": return K.token("child_database", t.title === "" ? "Untitled database" : t.title);
    case "childPage": return K.token("child_page", t.title === "" ? "Untitled page" : t.title);
    case "unsupported": {
      if (t.apiType === "image" && block.imageSource !== undefined) return K.image(block.imageSource);
      const text = blockPlainText(block);
      return K.token(t.apiType, text === "" ? t.apiType.replace(/_/g, " ") : text);
    }
  }
}

/** A server block's rich text as editor spans. */
export function spansOfBlock(block: Block, kind: ParagraphKind): RichTextSpan[] {
  switch (kind.t) {
    case "code": {
      const text = blockPlainText(block);
      return text === "" ? [] : [{ text, bold: false, italic: false, strikethrough: false, code: false }];
    }
    case "divider":
    case "token":
    case "image": return [];
    default: return normalize(block.richText);
  }
}

export function blockUpdate(kind: ParagraphKind, spans: RichTextSpan[], previousKind?: ParagraphKind): BlockUpdate {
  switch (kind.t) {
    case "callout": {
      // Only send the icon when it changed, so a non-emoji icon is never overwritten.
      const changed = previousKind === undefined ? true : !kindEquals(previousKind, kind);
      return changed && kind.icon !== "" ? { kind: "calloutContent", richText: spans, emoji: kind.icon } : { kind: "calloutContent", richText: spans };
    }
    case "toDo": return { kind: "content", richText: spans, checked: kind.checked };
    case "code": return { kind: "content", richText: spans, language: sendableLanguage(kind.language) };
    default: return { kind: "content", richText: spans };
  }
}

const fmt = (blockKind: Extract<NewBlock, { kind: "formatted" }>["blockKind"], richText: RichTextSpan[], o: { language?: string; checked?: boolean } = {}): NewBlock =>
  ({ kind: "formatted", blockKind, richText, language: o.language ?? "plain text", checked: o.checked ?? false });

export function newBlockFor(p: DocParagraph): NewBlock {
  const spans = p.spans;
  const k = p.kind;
  switch (k.t) {
    case "paragraph":
    case "token": return fmt("paragraph", spans);
    case "toggle": return fmt("toggle", spans);
    case "callout": return { kind: "callout", richText: spans, emoji: k.icon === "" ? defaultCalloutIcon : k.icon };
    case "heading1": return fmt("heading1", spans);
    case "heading2": return fmt("heading2", spans);
    case "heading3": return fmt("heading3", spans);
    case "bulleted": return fmt("bulletedListItem", spans);
    case "numbered": return fmt("numberedListItem", spans);
    case "toDo": return fmt("toDo", spans, { checked: k.checked });
    case "quote": return fmt("quote", spans);
    case "code": return fmt("code", spans, { language: sendableLanguage(k.language) });
    case "divider": return fmt("divider", []);
    case "image": {
      const src = parseImageSource(k.source);
      if (src?.t === "upload") return { kind: "imageUpload", id: src.id };
      if (src) return { kind: "imageExternal", url: src.url };
      return fmt("paragraph", []);
    }
  }
}

export function contentTypeForFilename(name: string): string {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  switch (ext) {
    case "jpg": case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "heic": return "image/heic";
    case "tif": case "tiff": return "image/tiff";
    case "bmp": return "image/bmp";
    case "svg": return "image/svg+xml";
    default: return "image/png";
  }
}
