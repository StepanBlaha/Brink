import { moveDownTarget, moveUpTarget, planMove, maxDepthForMove, type MovePlan } from "../domain/editor/blockMoves";
import type { EditorDocPort, TokenInfo } from "../domain/editor/ports";
import { docParagraphFromSpans, newLocalId, type DocParagraph, type SyncedParagraph } from "../domain/editor/types";
import { K, kindEquals, type ParagraphKind } from "../domain/markdown/paragraphKind";
import { maxDepth } from "../domain/markdown/paragraphSyntax";
import { normalize, spansFromContent } from "../domain/markdown/spanRuns";
import type { RichTextSpan } from "../domain/notion/richText";

interface Para {
  localId: string;
  blockId: string | null;
  kind: ParagraphKind;
  depth: number;
  spans: RichTextSpan[];
  collapsed: boolean;
}

const plain = (text: string): RichTextSpan => ({ text, bold: false, italic: false, strikethrough: false, code: false });
const textOf = (p: Para): string => p.spans.map((s) => s.text).join("");
const clone = (p: Para): Para => ({ ...p, spans: p.spans.map((s) => ({ ...s })) });

/**
 * The array-model `EditorDocPort` for Node tests (port of TestEditorHost's role): paragraphs are
 * plain objects; edit methods mimic what the text view does and follow the identity rules
 * (a split keeps the id on the top half, a merge keeps the first, ...). `undo()` restores the
 * previous snapshot of user edits.
 */
export class TestEditorHost implements EditorDocPort {
  private paras: Para[] = [];
  private history: Para[][] = [];
  editGeneration = 0;
  lastLocalEditAt: number | null = null;
  onLocalEdit: (() => void) | null = null;

  constructor(blocks: SyncedParagraph[] = []) {
    this.load(blocks);
  }

  // ---- EditorDocPort ----

  paragraphs(): DocParagraph[] {
    return this.paras.map((p) => docParagraphFromSpans({ localId: p.localId, blockId: p.blockId, kind: p.kind, depth: p.depth, spans: p.kind.t === "token" ? [] : p.spans }));
  }

  get isEmpty(): boolean {
    return this.paras.length === 0 || (this.paras.length === 1 && textOf(this.paras[0]!) === "" && this.paras[0]!.kind.t === "paragraph");
  }

  load(synced: SyncedParagraph[]): void {
    const depth = new Map<string, number>();
    this.paras = synced.map((b) => {
      const parent = b.parentId !== null ? depth.get(b.parentId) : undefined;
      const level = Math.min(parent !== undefined ? parent + 1 : 0, maxDepth);
      depth.set(b.blockId, level);
      return { localId: newLocalId(), blockId: b.blockId, kind: b.kind, depth: level, spans: b.spans.map((s) => ({ ...s })), collapsed: false };
    });
    this.history = [];
    this.editGeneration++;
  }

  setBlockId(localId: string, blockId: string): boolean {
    const p = this.paras.find((x) => x.localId === localId);
    if (!p) return false;
    p.blockId = blockId; // attribute-only: no edit, no undo step
    return true;
  }

  clearBlockId(blockId: string): void {
    for (const p of this.paras) if (p.blockId === blockId) p.blockId = null;
  }

  blockIdForLocal(localId: string): string | null {
    return this.paras.find((p) => p.localId === localId)?.blockId ?? null;
  }

  restoreToken(token: TokenInfo, depth: number, afterBlockId: string | null): void {
    const para: Para = { localId: newLocalId(), blockId: token.blockId, kind: K.token(token.type, token.title), depth, spans: [], collapsed: false };
    const at = afterBlockId === null ? 0 : this.paras.findIndex((p) => p.blockId === afterBlockId) + 1;
    this.edit(() => { this.paras.splice(at, 0, para); });
  }

  insertUploadPlaceholder(afterParagraphIndex: number): string {
    const para: Para = {
      localId: newLocalId(), blockId: null, kind: K.token("image_upload", "Uploading image…"),
      depth: this.paras[afterParagraphIndex]?.depth ?? 0, spans: [], collapsed: false,
    };
    this.edit(() => { this.paras.splice(afterParagraphIndex + 1, 0, para); });
    return para.localId;
  }

  replacePlaceholder(localId: string, uploadId: string): boolean {
    const p = this.paras.find((x) => x.localId === localId);
    if (!p) return false;
    this.edit(() => { p.kind = K.image(`upload:${uploadId}`); p.spans = []; });
    return true;
  }

  removePlaceholder(localId: string): void {
    const i = this.paras.findIndex((p) => p.localId === localId);
    if (i >= 0) this.edit(() => { this.paras.splice(i, 1); });
  }

  // ---- simulated user edits (each is one undo step and one local edit) ----

  private edit(fn: () => void): void {
    this.history.push(this.paras.map(clone));
    fn();
    this.editGeneration++;
    this.lastLocalEditAt = Date.now();
    this.onLocalEdit?.();
  }

  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.paras = prev;
    this.editGeneration++;
    this.lastLocalEditAt = Date.now();
    this.onLocalEdit?.();
    return true;
  }

  /** Document text; tokens and images show as the attachment character, like the Mac. */
  text(): string { return this.paras.map((p) => (p.kind.t === "token" || p.kind.t === "image" ? "\uFFFC" : textOf(p))).join("\n"); }
  kinds(): ParagraphKind[] { return this.paras.map((p) => p.kind); }
  blockIds(): (string | null)[] { return this.paras.map((p) => p.blockId); }
  indexOf(needle: string): number {
    const i = this.paras.findIndex((p) => textOf(p).includes(needle));
    if (i < 0) throw new Error(`${needle} not in document`);
    return i;
  }

  /** Replaces characters [start, end) of paragraph `index` (formatting of the left neighbor is inherited). */
  replaceText(index: number, start: number, end: number, text: string): void {
    this.edit(() => {
      const p = this.paras[index]!;
      const flat: RichTextSpan[] = [];
      p.spans.forEach((s) => { for (const ch of Array.from(s.text)) flat.push({ ...s, text: ch }); });
      const inherit = flat[Math.min(start, flat.length) - 1] ?? plain("");
      const insert = Array.from(text).map((ch) => ({ ...inherit, text: ch }));
      p.spans = normalize([...flat.slice(0, start), ...insert, ...flat.slice(end)]);
    });
  }

  /** Types `text` at `offset` of paragraph `index`, one character at a time. */
  type(index: number, offset: number, text: string): void {
    let at = offset;
    for (const ch of Array.from(text)) { this.replaceText(index, at, at, ch); at += ch.length; }
  }

  /** Enter at `offset`: the top half keeps the identity, the bottom is new. */
  split(index: number, offset: number, bottomKind: ParagraphKind = K.paragraph): void {
    this.edit(() => {
      const p = this.paras[index]!;
      const flat: RichTextSpan[] = [];
      p.spans.forEach((s) => { for (const ch of Array.from(s.text)) flat.push({ ...s, text: ch }); });
      const bottom: Para = { localId: newLocalId(), blockId: null, kind: bottomKind, depth: p.depth, spans: normalize(flat.slice(offset)), collapsed: false };
      p.spans = normalize(flat.slice(0, offset));
      this.paras.splice(index + 1, 0, bottom);
    });
  }

  /** Inserts a new paragraph (no id) after `index` (-1 = at the top). */
  insertParagraph(index: number, o: { text?: string; kind?: ParagraphKind; depth?: number; localId?: string }): string {
    const para: Para = {
      localId: o.localId ?? newLocalId(), blockId: null, kind: o.kind ?? K.paragraph, depth: o.depth ?? 0,
      spans: spansFromContent(o.text ?? "", o.kind ?? K.paragraph), collapsed: false,
    };
    this.edit(() => { this.paras.splice(index + 1, 0, para); });
    return para.localId;
  }

  removeParagraph(index: number): void {
    this.edit(() => { this.paras.splice(index, 1); });
  }

  /** Backspace at the start of paragraph `index`: the first block's id and kind win. */
  mergeWithPrevious(index: number): void {
    this.edit(() => {
      const prev = this.paras[index - 1]!;
      prev.spans = normalize([...prev.spans, ...this.paras[index]!.spans]);
      this.paras.splice(index, 1);
    });
  }

  setKind(index: number, kind: ParagraphKind): void { this.edit(() => { this.paras[index]!.kind = kind; }); }
  setDepth(index: number, depth: number): void { this.edit(() => { this.paras[index]!.depth = depth; }); }

  toggleCheckbox(index: number): void {
    const k = this.paras[index]!.kind;
    if (k.t === "toDo") this.setKind(index, K.toDo(!k.checked));
  }

  /** Bold (or any flag) on characters [start, end): removed if all runs have it, else added. */
  toggleMark(index: number, start: number, end: number, mark: "bold" | "italic" | "strikethrough" | "code"): void {
    this.edit(() => {
      const p = this.paras[index]!;
      const flat: RichTextSpan[] = [];
      p.spans.forEach((s) => { for (const ch of Array.from(s.text)) flat.push({ ...s, text: ch }); });
      const all = flat.slice(start, end).every((s) => s[mark]);
      for (let i = start; i < end; i++) flat[i] = { ...flat[i]!, [mark]: !all };
      p.spans = normalize(flat);
    });
  }

  /**
   * Slash command apply (EC L470-495): removes `/query` (from `slashOffset` to the end) and sets the
   * kind in one step; a divider on an empty line becomes divider + paragraph below, on a
   * non-empty line the text stays and a divider and a paragraph follow.
   */
  applySlash(index: number, kind: ParagraphKind, slashOffset: number): void {
    this.edit(() => {
      const p = this.paras[index]!;
      const flat: RichTextSpan[] = [];
      p.spans.forEach((sp) => { for (const ch of Array.from(sp.text)) flat.push({ ...sp, text: ch }); });
      p.spans = normalize(flat.slice(0, slashOffset));
      const mk = (k: ParagraphKind): Para => ({ localId: newLocalId(), blockId: null, kind: k, depth: p.depth, spans: [], collapsed: false });
      if (kind.t !== "divider") { p.kind = kind; return; }
      if (textOf(p) === "") { p.kind = kind; this.paras.splice(index + 1, 0, mk(K.paragraph)); }
      else this.paras.splice(index + 1, 0, mk(K.divider), mk(K.paragraph));
    });
  }

  // ---- moves, collapse ----

  private movable(): Para[] {
    const last = this.paras[this.paras.length - 1];
    const emptyTail = last !== undefined && textOf(last) === "" && last.kind.t !== "divider" && last.kind.t !== "image" && last.kind.t !== "token";
    return emptyTail ? this.paras.slice(0, -1) : this.paras;
  }

  maxDepthForMove(at: number, before: number): number { return maxDepthForMove(this.movable(), at, before); }

  moveBlock(at: number, before: number, depth: number): boolean {
    const plan = planMove(this.movable(), at, before, depth);
    if (!plan) return false;
    this.applyMove(plan);
    return true;
  }

  moveBlockUp(at: number): boolean {
    const t = moveUpTarget(this.movable(), at);
    return t ? this.moveBlock(at, t.target, t.depth) : false;
  }

  moveBlockDown(at: number): boolean {
    const t = moveDownTarget(this.movable(), at);
    return t ? this.moveBlock(at, t.target, t.depth) : false;
  }

  private applyMove(plan: MovePlan): void {
    this.edit(() => {
      const moved = plan.order.map((i) => {
        const p = this.paras[i]!;
        const depth = plan.depths.get(i);
        return depth === undefined ? p : { ...p, depth };
      });
      this.paras.splice(plan.lo, plan.hi - plan.lo + 1, ...moved);
    });
  }

  /** Indices hidden by collapsed toggles: the deeper-indented paragraphs that follow. Not an edit. */
  toggleCollapsed(index: number): void { this.paras[index]!.collapsed = !this.paras[index]!.collapsed; }
  isCollapsed(index: number): boolean { return this.paras[index]!.collapsed; }
  hiddenIndices(): number[] {
    const hidden: number[] = [];
    this.paras.forEach((p, i) => {
      if (!p.collapsed || p.kind.t !== "toggle") return;
      for (let j = i + 1; j < this.paras.length && this.paras[j]!.depth > p.depth; j++) hidden.push(j);
    });
    return [...new Set(hidden)];
  }

  /** Whether the document kinds equal `kinds` (test convenience). */
  hasKinds(kinds: ParagraphKind[]): boolean {
    return kinds.length === this.paras.length && kinds.every((k, i) => kindEquals(k, this.paras[i]!.kind));
  }
}
