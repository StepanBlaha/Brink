import { EditorState, TextSelection, type Plugin, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorDocPort, TokenInfo } from "../domain/editor/ports";
import type { SyncedParagraph } from "../domain/editor/types";
import { K } from "../domain/markdown/paragraphKind";
import { blockFor, docFromSynced } from "./loadDocument";
import { NON_EDIT } from "./identityPlugin";
import { schema } from "./schema";
import { snapshot } from "./snapshot";

export interface ImageFile { data: Uint8Array; filename: string; contentType: string }

/** The ProseMirror implementation of the engine's `EditorDocPort` (PORT 3.c.1). */
export class BrinkDoc implements EditorDocPort {
  state: EditorState;
  view: EditorView | null = null;
  editGeneration = 0;
  lastLocalEditAt: number | null = null;
  onLocalEdit: (() => void) | null = null;
  /** Observers of every state change (React, status). */
  readonly listeners = new Set<() => void>();
  /** Object URLs of images uploaded in this session, by file upload id (shown until the next load). */
  readonly localImages = new Map<string, string>();
  /** A fresh signed URL for an image block whose file URL expired (403). */
  freshImageUrl: ((blockId: string) => Promise<string | null>) | null = null;
  /** Images pasted or dropped; `afterIndex` is the block they go below. */
  onImages: ((files: ImageFile[], afterIndex: number) => void) | null = null;

  constructor(private readonly plugins: Plugin[], readonly stamps: Map<string, string>, synced: SyncedParagraph[] = []) {
    this.state = EditorState.create({ doc: docFromSynced(synced), schema, plugins });
  }

  /** The view's dispatchTransaction (also used without a view in tests). */
  dispatch = (tr: Transaction): void => {
    const { state, transactions } = this.state.applyTransaction(tr);
    this.state = state;
    this.view?.updateState(state);
    if (!tr.getMeta(NON_EDIT) && transactions.some((t) => t.docChanged)) {
      this.editGeneration++;
      this.lastLocalEditAt = Date.now();
      this.onLocalEdit?.();
    }
    for (const l of [...this.listeners]) l();
  };

  private nonEdit(tr: Transaction): Transaction {
    return tr.setMeta(NON_EDIT, true).setMeta("addToHistory", false);
  }

  find(pred: (n: PMNode) => boolean): { pos: number; node: PMNode; index: number } | null {
    let found: { pos: number; node: PMNode; index: number } | null = null;
    this.state.doc.forEach((node, pos, index) => { if (!found && pred(node)) found = { pos, node, index }; });
    return found;
  }

  paragraphs() { return snapshot(this.state.doc); }

  get isEmpty(): boolean {
    const d = this.state.doc;
    return d.childCount === 1 && d.child(0).content.size === 0 && d.child(0).attrs["kind"] === "paragraph";
  }

  load(synced: SyncedParagraph[], preserveSelection: boolean): void {
    const { $from } = this.state.selection;
    const keep = preserveSelection ? { id: $from.parent.attrs["blockId"] as string | null, offset: $from.parentOffset } : null;
    this.stamps.clear();
    const doc = docFromSynced(synced);
    let selection: TextSelection | undefined;
    if (keep?.id) {
      doc.forEach((n, pos) => {
        if (n.attrs["blockId"] === keep.id) selection = TextSelection.create(doc, pos + 1 + Math.min(keep.offset, n.content.size));
      });
    }
    this.state = EditorState.create({ doc, schema, plugins: this.plugins, ...(selection ? { selection } : {}) });
    this.editGeneration++;
    this.view?.updateState(this.state);
    for (const l of [...this.listeners]) l();
  }

  setBlockId(localId: string, blockId: string): boolean {
    const f = this.find((n) => n.attrs["localId"] === localId);
    if (!f) return false;
    this.stamps.set(localId, blockId);
    this.dispatch(this.nonEdit(this.state.tr.setNodeAttribute(f.pos, "blockId", blockId)));
    return true;
  }

  clearBlockId(blockId: string): void {
    for (const [k, v] of [...this.stamps]) if (v === blockId) this.stamps.delete(k);
    const tr = this.state.tr;
    let any = false;
    this.state.doc.forEach((n, pos) => { if (n.attrs["blockId"] === blockId) { tr.setNodeAttribute(pos, "blockId", null); any = true; } });
    if (any) this.dispatch(this.nonEdit(tr));
  }

  blockIdForLocal(localId: string): string | null {
    return (this.find((n) => n.attrs["localId"] === localId)?.node.attrs["blockId"] as string | undefined) ?? null;
  }

  restoreToken(token: TokenInfo, depth: number, afterBlockId: string | null): void {
    const after = afterBlockId === null ? null : this.find((n) => n.attrs["blockId"] === afterBlockId);
    const at = after ? after.pos + after.node.nodeSize : 0;
    this.dispatch(this.state.tr.insert(at, blockFor(K.token(token.type, token.title), [], { depth, blockId: token.blockId })));
  }

  insertUploadPlaceholder(afterParagraphIndex: number): string {
    const doc = this.state.doc;
    const idx = Math.min(Math.max(afterParagraphIndex, 0), doc.childCount - 1);
    let at = 0;
    for (let i = 0; i <= idx; i++) at += doc.child(i).nodeSize;
    const block = blockFor(K.token("image_upload", "Uploading image…"), [], { depth: doc.child(idx).attrs["depth"] as number });
    this.dispatch(this.state.tr.insert(at, block));
    return block.attrs["localId"] as string;
  }

  replacePlaceholder(localId: string, uploadId: string): boolean {
    const f = this.find((n) => n.attrs["localId"] === localId);
    if (!f) return false;
    const block = blockFor(K.image(`upload:${uploadId}`), [], { depth: f.node.attrs["depth"] as number, localId });
    this.dispatch(this.state.tr.replaceWith(f.pos, f.pos + f.node.nodeSize, block));
    return true;
  }

  removePlaceholder(localId: string): void {
    const f = this.find((n) => n.attrs["localId"] === localId);
    if (f) this.dispatch(this.state.tr.delete(f.pos, f.pos + f.node.nodeSize));
  }
}
