import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { uploadingChipView } from "./UploadingChip";

const icons: Record<string, string> = { child_database: "▦", child_page: "📄" };

export function chipTitle(type: string, title: string): string {
  if (title !== "") return title;
  if (type === "child_database") return "Untitled database";
  if (type === "child_page") return "Untitled page";
  return type.replace(/_/g, " ");
}

/** Mounts a compact database under a `child_database` chip; returns the unmount function. */
export type EmbedDatabase = (databaseId: string, container: HTMLElement) => () => void;

/** Atomic chip for child pages / databases / other tokens; click opens Notion (PORT 3.c.8). */
export function tokenChipView(open: (blockId: string) => void, embed?: EmbedDatabase) {
  return (node: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => {
    if (node.attrs["type"] === "image_upload") return uploadingChipView();
    const dom = document.createElement("span");
    dom.className = "chip";
    dom.contentEditable = "false";
    const label = document.createElement("span");
    label.className = "chip-label";
    dom.append(label);
    let unmount: (() => void) | null = null;
    const blockId = (): string | null => {
      const pos = getPos();
      return pos === undefined ? null : (view.state.doc.resolve(pos).parent.attrs["blockId"] as string | null);
    };
    const render = (n: PMNode) => {
      const type = n.attrs["type"] as string;
      label.textContent = `${icons[type] ?? "▪︎"}  ${chipTitle(type, n.attrs["title"] as string)}`;
      dom.dataset["type"] = type;
    };
    render(node);
    const isDb = node.attrs["type"] === "child_database" && embed !== undefined;
    let host: HTMLElement | null = null;
    if (isDb) {
      dom.classList.add("db");
      host = document.createElement("div");
      host.className = "chip-embed";
      dom.append(host);
      queueMicrotask(() => {
        const id = blockId();
        if (id && host?.isConnected !== false) unmount = embed(id, host!);
      });
    }
    label.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const id = blockId();
      if (id) open(id);
    });
    return {
      dom,
      update: (n) => { if (n.type.name !== "chip" || n.attrs["type"] === "image_upload") return false; render(n); return true; },
      stopEvent: (e) => host !== null && host.contains(e.target as Node),
      ignoreMutation: () => true,
      destroy: () => { unmount?.(); unmount = null; },
    };
  };
}
