import { Schema, type Node as PMNode, type NodeSpec, type MarkSpec } from "prosemirror-model";
import { apiType, kindFromTag, kindTag, K, type ParagraphKind } from "../domain/markdown/paragraphKind";
import { newLocalId } from "../domain/editor/types";

/** Flat document: every block is one Notion paragraph; depth is an attribute (PORT 3.c.2). */
const nodes: Record<string, NodeSpec> = {
  doc: { content: "block+" },
  text: { group: "inline" },
  block: {
    content: "inline*",
    group: "block",
    defining: true,
    attrs: { localId: { default: "" }, blockId: { default: null }, kind: { default: "paragraph" }, depth: { default: 0 }, collapsed: { default: false } },
    toDOM(node) {
      const a = node.attrs as { kind: string; depth: number; collapsed: boolean };
      const kind = kindOf(node);
      return ["div", { class: `blk k-${apiType(kind)}`, "data-kind": a.kind, "data-depth": String(a.depth), style: `--d:${a.depth}` }, 0];
    },
  },
  hard_break: { inline: true, group: "inline", selectable: false, toDOM: () => ["br"] },
  chip: {
    inline: true, group: "inline", atom: true, selectable: true,
    attrs: { type: { default: "" }, title: { default: "" } },
    toDOM: (n) => ["span", { class: "chip", "data-type": n.attrs["type"] as string }, n.attrs["title"] as string],
  },
  image: {
    inline: true, group: "inline", atom: true, selectable: true,
    attrs: { source: { default: "" } },
    toDOM: (n) => ["span", { class: "img", "data-source": n.attrs["source"] as string }, "Image"],
  },
};

const marks: Record<string, MarkSpec> = {
  bold: { toDOM: () => ["strong", 0] },
  italic: { toDOM: () => ["em", 0] },
  strike: { toDOM: () => ["s", 0] },
  underline: { toDOM: () => ["u", 0] },
  code: { toDOM: () => ["code", 0] },
  link: { attrs: { href: {} }, inclusive: false, toDOM: (m) => ["a", { href: m.attrs["href"] as string }, 0] },
  color: { attrs: { color: {} }, toDOM: (m) => ["span", { "data-color": m.attrs["color"] as string }, 0] },
};

export const schema = new Schema({ nodes, marks });
export const blockType = schema.nodes["block"]!;

/** The kind of a block node (token title / image source come from the atom). */
export function kindOf(node: PMNode): ParagraphKind {
  const k = kindFromTag(node.attrs["kind"] as string) ?? K.paragraph;
  if (k.t === "token") {
    const chip = firstChild(node, "chip");
    return K.token(k.type, (chip?.attrs["title"] as string | undefined) ?? "");
  }
  return k;
}

export function firstChild(node: PMNode, name: string): PMNode | null {
  let found: PMNode | null = null;
  node.forEach((c) => { if (!found && c.type.name === name) found = c; });
  return found;
}

export interface BlockInit {
  kind?: ParagraphKind;
  depth?: number;
  localId?: string;
  blockId?: string | null;
  collapsed?: boolean;
}

export function blockAttrs(o: BlockInit = {}): Record<string, unknown> {
  return {
    localId: o.localId ?? newLocalId(), blockId: o.blockId ?? null, kind: kindTag(o.kind ?? K.paragraph),
    depth: o.depth ?? 0, collapsed: o.collapsed ?? false,
  };
}

export function makeBlock(o: BlockInit = {}, content?: PMNode | PMNode[] | null): PMNode {
  return blockType.create(blockAttrs(o), content ?? undefined);
}

export const isCodeKind = (node: PMNode): boolean => (node.attrs["kind"] as string).startsWith("code");
