import type { Node as PMNode } from "prosemirror-model";
import { docParagraphFromSpans, type DocParagraph } from "../domain/editor/types";
import type { RichTextSpan } from "../domain/notion/richText";
import { K } from "../domain/markdown/paragraphKind";
import { span } from "../domain/notion/richText";
import { kindOf } from "./schema";

/** Rich text of a (possibly partial) block node; hard break becomes "\n", U+FFFC is stripped. */
export function spansOfBlock(block: PMNode): RichTextSpan[] {
  const isCode = (block.attrs["kind"] as string).startsWith("code");
  const out: RichTextSpan[] = [];
  block.forEach((child) => {
    if (child.isText || child.type.name === "hard_break") {
      const text = child.isText ? child.text!.replace(/￼/g, "") : "\n";
      const has = (n: string) => child.marks.some((m) => m.type.name === n);
      const link = child.marks.find((m) => m.type.name === "link");
      const color = child.marks.find((m) => m.type.name === "color");
      out.push(span(text, isCode ? {} : {
        bold: has("bold"), italic: has("italic"), strikethrough: has("strike"), code: has("code"), underline: has("underline"),
        ...(link ? { link: link.attrs["href"] as string } : {}),
        ...(color ? { color: color.attrs["color"] as string } : {}),
      }));
    }
  });
  return out;
}

export function paragraphOf(block: PMNode): DocParagraph {
  const kind = kindOf(block);
  const spans = kind.t === "token" || kind.t === "image" || kind.t === "divider" ? [] : spansOfBlock(block);
  return docParagraphFromSpans({
    localId: block.attrs["localId"] as string, blockId: block.attrs["blockId"] as string | null,
    kind: kind.t === "image" ? K.image((block.attrs["kind"] as string).slice(6)) : kind,
    depth: block.attrs["depth"] as number, spans,
  });
}

/** The planner input: every block in order, including the empty last one. */
export function snapshot(doc: PMNode): DocParagraph[] {
  const out: DocParagraph[] = [];
  doc.forEach((b) => out.push(paragraphOf(b)));
  return out;
}
