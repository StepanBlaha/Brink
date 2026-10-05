import { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import { createBrinkDoc } from "../editor/setup";
import type { BrinkDoc } from "../editor/docPort";
import { kindOf } from "../editor/schema";
import { syncedParagraph, type SyncedParagraph } from "../domain/editor/types";
import type { ParagraphKind } from "../domain/markdown/paragraphKind";

// jsdom has no layout; ProseMirror only asks for rects when scrolling.
const rect = { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
const list = Object.assign([], { item: () => null });
Range.prototype.getClientRects ??= () => list as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => rect as DOMRect;

export const block = (id: string, content: string, kind: ParagraphKind = { t: "paragraph" }, parent?: string): SyncedParagraph =>
  syncedParagraph({ blockId: id, kind, content, ...(parent ? { parentId: parent } : {}) });

/** A real EditorView in jsdom plus helpers that mimic typing and keys (the TestEditorHost counterpart). */
export class PMHost {
  readonly doc: BrinkDoc;
  readonly view: EditorView;
  constructor(blocks: SyncedParagraph[] = [block("e", "")]) {
    this.doc = createBrinkDoc(blocks);
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    this.view = new EditorView(mount, { state: this.doc.state, dispatchTransaction: this.doc.dispatch });
    this.doc.view = this.view;
    this.caretAtEnd();
  }

  get state() { return this.doc.state; }
  get text(): string { return this.state.doc.textBetween(0, this.state.doc.content.size, "\n", "￼"); }
  get kinds(): ParagraphKind[] { const k: ParagraphKind[] = []; this.state.doc.forEach((n) => k.push(kindOf(n))); return k; }
  get ids(): (string | null)[] { return this.doc.paragraphs().map((p) => p.blockId); }

  /** Caret at `offset` of block `index`. */
  caret(index: number, offset = 0): void {
    let pos = 0;
    for (let i = 0; i < index; i++) pos += this.state.doc.child(i).nodeSize;
    this.view.dispatch(this.state.tr.setSelection(TextSelection.create(this.state.doc, pos + 1 + offset)));
  }
  caretAtEnd(): void {
    const last = this.state.doc.childCount - 1;
    this.caret(last, this.state.doc.child(last).content.size);
  }
  select(from: number, to: number): void {
    this.view.dispatch(this.state.tr.setSelection(TextSelection.create(this.state.doc, from, to)));
  }

  type(text: string): void {
    for (const ch of Array.from(text)) {
      const { from, to } = this.state.selection;
      const handled = this.view.someProp("handleTextInput", (f) => f(this.view, from, to, ch, () => this.state.tr));
      if (!handled) this.view.dispatch(this.state.tr.insertText(ch, from, to));
    }
  }

  key(key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}): boolean {
    const ev = new KeyboardEvent("keydown", { key, ctrlKey: mods.ctrl ?? false, shiftKey: mods.shift ?? false, altKey: mods.alt ?? false, bubbles: true, cancelable: true });
    return this.view.someProp("handleKeyDown", (f) => f(this.view, ev)) ?? false;
  }
  enter(): void { this.key("Enter"); }
  backspace(): void { this.key("Backspace"); }
  undo(): void { this.key("z", { ctrl: true }); }

  paste(text: string): void {
    const ev = new Event("paste") as ClipboardEvent;
    Object.defineProperty(ev, "clipboardData", { value: { getData: () => text } });
    this.view.someProp("handlePaste", (f) => f(this.view, ev, this.state.doc.slice(0, 0)));
  }

  copyText(): string {
    const slice = this.state.doc.slice(0, this.state.doc.content.size);
    return this.view.someProp("clipboardTextSerializer", (f) => f(slice, this.view)) ?? "";
  }
}
