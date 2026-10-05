import { describe, expect, it } from "vitest";
import {
  comboFor, comboFromKeyEvent, conflict, conflictMessage, displayAccelerator, formatCombo, hotkeyActions, hotkeyDefaults,
  occupiedCombos, parseAccelerator, validateCombo, type Combo,
} from "./hotkeys";

const c = (s: string): Combo => parseAccelerator(s) as Combo;
const ev = (code: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) =>
  comboFromKeyEvent({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

describe("accelerator parse and format", () => {
  it.each([
    ["Alt+Space", "Alt+Space"],
    ["shift+alt+space", "Alt+Shift+Space"],
    ["Ctrl+Alt+v", "Ctrl+Alt+V"],
    ["CommandOrControl+Shift+K", "Ctrl+Shift+K"],
    ["Alt", "Alt"],
  ])("%s -> %s", (input, out) => expect(formatCombo(c(input))).toBe(out));

  it.each(["", "+", "Alt+", "A+B", "Ctrl++"])("rejects %j", (s) => expect(parseAccelerator(s)).toBeNull());

  it("openPinN displays Alt+1–9", () => {
    expect(displayAccelerator("openPinN", "Alt")).toBe("Alt+1–9");
    expect(displayAccelerator("openPinN", "Ctrl+Alt")).toBe("Ctrl+Alt+1–9");
    expect(displayAccelerator("quickCapture", "Alt+Shift+Space")).toBe("Alt+Shift+Space");
  });
});

describe("conflicts", () => {
  const defaults = {};
  it("defaults do not conflict", () => {
    for (const a of hotkeyActions) expect(conflict(defaults, a, comboFor(defaults, a))).toBeNull();
    expect(comboFor({ quickCapture: "junk" }, "quickCapture")).toEqual(c(hotkeyDefaults.quickCapture));
  });
  it("detects a clash with another action", () => {
    expect(conflict(defaults, "quickCapture", c("Alt+Space"))).toBe("toggleLastPin");
  });
  it("openPinN occupies nine combos", () => {
    expect(occupiedCombos("openPinN", c("Alt"))).toHaveLength(9);
    expect(conflict(defaults, "clipboardAppend", c("Alt+3"))).toBe("openPinN");
    expect(conflict(defaults, "toggleLastPin", c("Alt+9"))).toBe("openPinN");
    expect(conflict(defaults, "toggleLastPin", c("Alt+0"))).toBeNull();
    expect(conflict({ clipboardAppend: "Alt+5" }, "openPinN", c("Alt"))).toBe("clipboardAppend");
    expect(conflict(defaults, "openPinN", c("Ctrl+Alt"))).toBeNull();
  });
  it("messages", () => {
    expect(conflictMessage("toggleLastPin", c("Alt+Space"), "quickCapture", false)).toBe('Alt+Space is already used by "Toggle last-opened pin".');
    expect(conflictMessage("openPinN", c("Alt"), "toggleLastPin", true)).toBe('Default is in use by "Open pin 1–9 of active group"; change that one first.');
  });
});

describe("validateCombo", () => {
  it.each([
    ["Alt+Space", null],
    ["Ctrl+Shift+K", null],
    ["Alt", null],
    ["Shift+K", "Use at least Ctrl or Alt."],
    ["F5", "Use at least Ctrl or Alt."],
  ])("%s", (s, out) => expect(validateCombo(c(s))).toBe(out));
  it.each(["Ctrl+Alt+Delete", "Alt+Tab", "Alt+F4", "Ctrl+Esc", "Ctrl+Shift+Esc", "Alt+Esc", "Ctrl+PrintScreen", "Alt+PrintScreen"])(
    "reserves %s", (s) => expect(validateCombo(c(s))).not.toBeNull());
  it("rejects Win/Super/Meta", () => {
    for (const s of ["Super+V", "Win+Alt+K", "Meta+Ctrl+K"]) expect(validateCombo(c(s))).toMatch(/Windows key/);
  });
});

describe("comboFromKeyEvent", () => {
  it.each([
    ["Space", "Space"], ["KeyA", "A"], ["KeyZ", "Z"], ["Digit0", "0"], ["Digit7", "7"], ["F1", "F1"], ["F24", "F24"],
    ["ArrowUp", "Up"], ["Escape", "Esc"], ["Minus", "-"], ["PageDown", "PageDown"],
  ])("%s -> %s", (code, key) => expect(ev(code, { altKey: true })?.key).toBe(key));
  it("ignores modifiers and unknown codes", () => {
    for (const code of ["ControlLeft", "AltRight", "ShiftLeft", "MetaLeft", "F25", "Numpad1"]) expect(ev(code)).toBeNull();
  });
  it("reads modifier flags", () => {
    expect(formatCombo(ev("KeyV", { ctrlKey: true, altKey: true }) as Combo)).toBe("Ctrl+Alt+V");
    expect(ev("KeyV", { metaKey: true })?.meta).toBe(true);
  });
});
