import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";

const icons: Record<string, string> = { child_database: "▦", child_page: "📄" };

export function chipTitle(type: string, title: string): string {
  if (title !== "") return title;
  if (type === "child_database") return "Untitled database";
  if (type === "child_page") return "Untitled page";
  return type.replace(/_/g, " ");
}

/** Atomic chip for child pages / databases / other tokens; click opens Notion (PORT 3.c.8). */
export function tokenChipView(open: (blockId: string) => void) {
  return (node: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => {
    const dom = document.createElement("span");
    dom.className = "chip";
    dom.contentEditable = "false";
    const render = (n: PMNode) => {
      const type = n.attrs["type"] as string;
      dom.textContent = `${icons[type] ?? "▪︎"}  ${chipTitle(type, n.attrs["title"] as string)}`;
      dom.dataset["type"] = type;
    };
    render(node);
    dom.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = getPos();
      if (pos === undefined) return;
      const id = view.state.doc.resolve(pos).parent.attrs["blockId"] as string | null;
      if (id) open(id);
    });
    return { dom, update: (n) => { if (n.type.name !== "chip") return false; render(n); return true; } };
  };
}
