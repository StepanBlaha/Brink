import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { parseImageSource } from "../../domain/markdown/paragraphKind";
import type { BrinkDoc } from "../docPort";

/** What the node view needs to show an image (PORT 3.c.9; ImageAttachment.swift). */
export interface ImageEnv {
  /** Object URL for an image uploaded in this session. */
  local(uploadId: string): string | undefined;
  /** A fresh signed URL for a Notion file that returned 403. */
  fresh(blockId: string): Promise<string | null>;
}

export const imageEnvOf = (doc: BrinkDoc): ImageEnv => ({
  local: (id) => doc.localImages.get(id),
  fresh: (blockId) => doc.freshImageUrl ? doc.freshImageUrl(blockId) : Promise.resolve(null),
});

/** Inline image atom: loading 90 px "Loading image…", failed 36 px "Image unavailable", radius 6, max height 240. */
export function imageView(env: ImageEnv) {
  return (node: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => {
    const dom = document.createElement("span");
    dom.className = "img-wrap loading";
    dom.contentEditable = "false";
    const note = document.createElement("span");
    note.className = "img-note";
    note.textContent = "Loading image…";
    const img = document.createElement("img");
    img.className = "img";
    img.draggable = false;
    img.alt = "";
    dom.append(note, img);
    let retried = false;
    const state = (s: "loading" | "ready" | "failed") => {
      dom.className = `img-wrap ${s}`;
      note.textContent = s === "failed" ? "Image unavailable" : "Loading image…";
    };
    img.addEventListener("load", () => state("ready"));
    img.addEventListener("error", () => {
      const src = parseImageSource(node.attrs["source"] as string);
      const pos = getPos();
      const blockId = pos === undefined ? null : (view.state.doc.resolve(pos).parent.attrs["blockId"] as string | null);
      if (src?.t === "file" && !retried && blockId) {
        retried = true;
        void env.fresh(blockId).then((url) => { if (url) img.src = url; else state("failed"); }, () => state("failed"));
      } else state("failed");
    });
    const render = (n: PMNode) => {
      retried = false;
      const src = parseImageSource(n.attrs["source"] as string);
      const url = src?.t === "upload" ? env.local(src.id) : src?.url;
      if (!url) { state(src?.t === "upload" ? "loading" : "failed"); img.removeAttribute("src"); return; }
      state("loading");
      img.src = url;
    };
    render(node);
    let current = node.attrs["source"] as string;
    return {
      dom,
      selectNode: () => dom.classList.add("selected"),
      deselectNode: () => dom.classList.remove("selected"),
      update: (n) => {
        if (n.type.name !== "image") return false;
        if (n.attrs["source"] !== current) { current = n.attrs["source"] as string; render(n); }
        return true;
      },
      ignoreMutation: () => true,
    };
  };
}
