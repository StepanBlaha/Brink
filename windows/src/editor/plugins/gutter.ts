import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { numbers } from "../../domain/markdown/listNumbering";
import { K, kindTag } from "../../domain/markdown/paragraphKind";
import { kindOf } from "../schema";
import { toggleCollapsed } from "./toggleCollapse";

const bullets = ["•", "◦", "▪︎"];

function widget(cls: string, text: string, onClick?: (view: EditorView, blockPos: number) => void): (view: EditorView, getPos: () => number | undefined) => HTMLElement {
  return (view, getPos) => {
    const el = document.createElement("span");
    el.className = `gut ${cls}`;
    el.contentEditable = "false";
    el.textContent = text;
    if (onClick) {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const p = getPos();
        if (p !== undefined) onClick(view, p - 1);
      });
    }
    return el;
  };
}

function toggleCheckbox(view: EditorView, blockPos: number): void {
  const node = view.state.doc.nodeAt(blockPos);
  if (!node) return;
  const k = kindOf(node);
  if (k.t !== "toDo") return;
  view.dispatch(view.state.tr.setNodeAttribute(blockPos, "kind", kindTag(K.toDo(!k.checked))));
}

/** Gutter markers are drawn, never text: widget decorations at the start of each block (PORT 3.c.8). */
export const gutterPlugin = (): Plugin =>
  new Plugin({
    props: {
      decorations(state) {
        const items: { kind: ReturnType<typeof kindOf>; depth: number; pos: number; collapsed: boolean }[] = [];
        state.doc.forEach((n, pos) => items.push({ kind: kindOf(n), depth: n.attrs["depth"] as number, pos, collapsed: n.attrs["collapsed"] as boolean }));
        const nums = numbers(items);
        const decos: Decoration[] = [];
        items.forEach((it, i) => {
          const at = it.pos + 1;
          const opts = { side: -1, ignoreSelection: true, stopEvent: () => true };
          switch (it.kind.t) {
            case "bulleted":
              decos.push(Decoration.widget(at, widget(`bullet b${it.depth % 3}`, bullets[it.depth % 3]!), { ...opts, key: `bu${it.depth % 3}` }));
              break;
            case "numbered":
              decos.push(Decoration.widget(at, widget("num", `${nums[i]}.`), { ...opts, key: `n${nums[i]}` }));
              break;
            case "toDo": {
              const c = it.kind.checked;
              decos.push(Decoration.widget(at, widget(`check${c ? " on" : ""}`, c ? "✓" : "", toggleCheckbox), { ...opts, key: `c${c}` }));
              break;
            }
            case "toggle":
              decos.push(Decoration.widget(at, widget("arrow", it.collapsed ? "▸" : "▾", (v, p) => toggleCollapsed(v, p)), { ...opts, key: `t${it.collapsed}` }));
              break;
            case "callout":
              decos.push(Decoration.widget(at, widget("icon", it.kind.icon), { ...opts, key: `i${it.kind.icon}` }));
              break;
          }
        });
        return DecorationSet.create(state.doc, decos);
      },
    },
  });
