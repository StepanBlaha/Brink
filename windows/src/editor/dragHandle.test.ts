import { describe, expect, it } from "vitest";
import { K } from "../domain/markdown/paragraphKind";
import { block, PMHost } from "../test/pmHost";
import { dropDepth, dropIndex } from "./plugins/dragHandle";

describe("drag handle math", () => {
  it("target is the first visible block whose midpoint is below the pointer", () => {
    expect(dropIndex([10, 30, 50], 0)).toBe(0);
    expect(dropIndex([10, 30, 50], 31)).toBe(2);
    expect(dropIndex([10, null, 50], 20)).toBe(2);
    expect(dropIndex([10, 30, 50], 80)).toBe(3);
  });
  it("depth = source depth + round(dx / 24), clamped", () => {
    expect(dropDepth(0, 23, 3)).toBe(1);
    expect(dropDepth(0, 11, 3)).toBe(0);
    expect(dropDepth(1, -30, 3)).toBe(0);
    expect(dropDepth(1, 240, 2)).toBe(2);
    expect(dropDepth(0, 240, 9)).toBe(3);
  });
});

const ev = (type: string, x: number, y: number, extra: object = {}) =>
  Object.assign(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 }), extra);

function layout(h: PMHost): void {
  const kids = Array.from(h.view.dom.children) as HTMLElement[];
  kids.forEach((el, i) => {
    el.getBoundingClientRect = () => ({ top: i * 20, bottom: i * 20 + 20, left: 0, right: 400, width: 400, height: 20, x: 0, y: i * 20, toJSON: () => ({}) });
  });
}

describe("drag handle plugin", () => {
  const setup = () => {
    const h = new PMHost([block("a", "A", K.bulleted), block("b", "B"), block("c", "C")]);
    layout(h);
    const handle = h.view.dom.parentElement!.querySelector(".brink-handle") as HTMLElement;
    const line = h.view.dom.parentElement!.querySelector(".brink-drop") as HTMLElement;
    return { h, handle, line };
  };
  it("shows on hover, drags after 3 px with the indicator, drop moves the block at the x depth", () => {
    const { h, handle, line } = setup();
    h.view.dom.parentElement!.dispatchEvent(ev("pointermove", 100, 5));
    expect(handle.hidden).toBe(false);
    handle.dispatchEvent(ev("pointerdown", 20, 5));
    window.dispatchEvent(ev("pointermove", 21, 5));
    expect(line.hidden).toBe(true); // under the threshold
    window.dispatchEvent(ev("pointermove", 70, 50)); // below the last block: end; dx 50 -> +2, clamped to 1 (one below c)
    expect(line.hidden).toBe(false);
    window.dispatchEvent(ev("pointerup", 70, 50));
    expect(h.doc.paragraphs().map((p) => `${p.blockId}@${p.depth}`)).toEqual(["b@0", "c@0", "a@1"]);
    expect(line.hidden).toBe(true);
  });
  it("dropping further right nests under the block above", () => {
    const { h, handle } = setup();
    h.view.dom.parentElement!.dispatchEvent(ev("pointermove", 100, 45)); // over c
    handle.dispatchEvent(ev("pointerdown", 20, 45));
    window.dispatchEvent(ev("pointermove", 45, 15)); // before b (midpoint 30 > 15 -> index 1)... dx 25 -> +1
    window.dispatchEvent(ev("pointerup", 45, 15));
    expect(h.doc.paragraphs().map((p) => `${p.blockId}@${p.depth}`)).toEqual(["a@0", "c@1", "b@0"]);
  });
  it("a click without moving selects the block content", () => {
    const { h, handle } = setup();
    h.view.dom.parentElement!.dispatchEvent(ev("pointermove", 100, 25));
    handle.dispatchEvent(ev("pointerdown", 20, 25));
    window.dispatchEvent(ev("pointerup", 20, 25));
    const s = h.state.selection;
    expect(h.state.doc.textBetween(s.from, s.to)).toBe("B");
  });
});
