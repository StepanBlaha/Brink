import { Plugin, PluginKey, type Transaction } from "prosemirror-state";
import { newLocalId } from "../domain/editor/types";
import { kindFromTag } from "../domain/markdown/paragraphKind";
import { firstChild } from "./schema";

export const identityKey = new PluginKey("brinkIdentity");

/** Meta set on transactions that are not user edits (stamps, collapse, loads). */
export const NON_EDIT = "brink-non-edit";

/**
 * Identity rules of `processEdit` (PORT 3.c.3). Splits and merges get their outcome from the
 * commands (top half keeps the id); here duplicates become fresh, kinds are repaired, code loses
 * its marks and ids the engine already stamped survive an undo.
 * `stamps` maps localId to the confirmed Notion id.
 */
export function identityPlugin(stamps: Map<string, string>): Plugin {
  return new Plugin({
    key: identityKey,
    appendTransaction(trs, _old, state) {
      if (!trs.some((t) => t.docChanged)) return null;
      const tr: Transaction = state.tr;
      const seenLocal = new Set<string>();
      const seenBlock = new Set<string>();
      let changed = false;
      state.doc.forEach((node, offset) => {
        const a = node.attrs as { localId: string; blockId: string | null; kind: string };
        const kind = kindFromTag(a.kind);
        const hasChip = firstChild(node, "chip") !== null;
        const hasImage = firstChild(node, "image") !== null;
        const set = (name: string, v: unknown) => { tr.setNodeAttribute(offset, name, v); changed = true; };
        let fresh = false;
        if (a.localId === "" || seenLocal.has(a.localId)) fresh = true;
        else if ((kind?.t === "token" && !hasChip) || (kind?.t === "image" && !hasImage)) fresh = true;
        if (fresh) {
          const id = newLocalId();
          set("localId", id);
          if (a.blockId !== null) set("blockId", null);
          if (a.kind !== "paragraph") set("kind", "paragraph");
          seenLocal.add(id);
        } else {
          seenLocal.add(a.localId);
          let blockId = a.blockId;
          if (blockId === null) {
            const stamped = stamps.get(a.localId);
            if (stamped !== undefined && !seenBlock.has(stamped)) { blockId = stamped; set("blockId", stamped); }
          } else if (seenBlock.has(blockId)) { blockId = null; set("blockId", null); }
          if (blockId !== null) seenBlock.add(blockId);
          if (kind?.t === "divider" && node.content.size > 0) set("kind", "paragraph");
        }
        if (node.attrs["kind"].toString().startsWith("code") && !fresh) {
          const marked = node.content.size > 0 && node.childCount > 0 && Array.from({ length: node.childCount }, (_, i) => node.child(i)).some((c) => c.marks.length > 0);
          if (marked) { tr.removeMark(offset + 1, offset + node.nodeSize - 1); changed = true; }
        }
      });
      if (!changed) return null;
      tr.setMeta("addToHistory", false);
      return tr;
    },
  });
}
