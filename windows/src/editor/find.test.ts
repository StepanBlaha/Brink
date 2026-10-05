import { describe, expect, it } from "vitest";
import { K } from "../domain/markdown/paragraphKind";
import { block, PMHost } from "../test/pmHost";
import { countLabel, findAction, findKey, findKeyAction, findMatches } from "./plugins/find";

const host = () => new PMHost([block("a", "Zítra jdeme na výlet, zitra!"), block("b", "Nothing here"), block("c", "ZÍTRA a zítra", K.bulleted)]);
const f = (h: PMHost) => findKey.getState(h.state)!;
const run = (h: PMHost, m: Parameters<typeof findAction>[1]) => h.view.dispatch(findAction(h.state.tr, m));

describe("find plugin", () => {
  it("is case and diacritic insensitive: 'zitra' finds 'zítra'; matches don't overlap", () => {
    const h = host();
    expect(findMatches(h.state.doc, "zitra")).toHaveLength(4);
    expect(findMatches(new PMHost([block("x", "aaaa")]).state.doc, "aa")).toHaveLength(2);
    expect(findMatches(h.state.doc, "")).toEqual([]);
  });
  it("counter 'i of n', Enter / Shift+Enter wrap, close clears", () => {
    const h = host();
    h.caret(0, 0);
    run(h, { open: true });
    run(h, { query: "zitra" });
    expect(countLabel(f(h))).toBe("1 of 4");
    run(h, { step: 1 });
    expect(countLabel(f(h))).toBe("2 of 4");
    run(h, { step: -1 });
    run(h, { step: -1 });
    expect(countLabel(f(h))).toBe("4 of 4");
    expect(h.view.dom.querySelectorAll(".find").length).toBe(4);
    expect(h.view.dom.querySelectorAll(".find-cur").length).toBe(1);
    run(h, { query: "nomatch" });
    expect(countLabel(f(h))).toBe("0 of 0");
    run(h, { close: true });
    expect(f(h).open).toBe(false);
    expect(h.view.dom.querySelectorAll(".find").length).toBe(0);
  });
  it("re-runs on edits keeping the position, and never changes the document", () => {
    const h = host();
    run(h, { open: true });
    run(h, { query: "nothing" });
    const before = h.text;
    expect(countLabel(f(h))).toBe("1 of 1");
    h.caret(1, 0);
    h.type("Nothing ");
    expect(countLabel(f(h))).toBe("1 of 2");
    expect(h.text).toBe(before.replace("Nothing here", "Nothing Nothing here"));
  });
  it("keys: Ctrl+F prefills from a short selection, F3 and Ctrl+G step", () => {
    const h = host();
    h.select(1, 5);
    const open = findKeyAction(h.view, { key: "f", ctrlKey: true, metaKey: false, shiftKey: false });
    expect(open).toEqual({ open: "Zítr" });
    run(h, open!);
    expect(f(h).query).toBe("Zítr");
    expect(findKeyAction(h.view, { key: "F3", ctrlKey: false, metaKey: false, shiftKey: true })).toEqual({ step: -1 });
    expect(findKeyAction(h.view, { key: "g", ctrlKey: true, metaKey: false, shiftKey: false })).toEqual({ step: 1 });
    expect(findKeyAction(h.view, { key: "a", ctrlKey: true, metaKey: false, shiftKey: false })).toBeNull();
  });
});
