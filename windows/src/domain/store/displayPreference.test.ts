import { describe, expect, it } from "vitest";
import { primaryFirst, resolveDisplay } from "./displayPreference";

const primary = { name: "DISPLAY1", frame: { x: 0, y: 0, width: 2560, height: 1440 } };
const portrait = { name: "DISPLAY2", frame: { x: -1440, y: -603, width: 1440, height: 2560 } };

describe("primaryFirst", () => {
  it("moves the monitor at the origin to the front", () => {
    expect(primaryFirst([portrait, primary])).toEqual([primary, portrait]);
    expect(primaryFirst([primary, portrait])).toEqual([primary, portrait]);
  });

  it("keeps the order when no monitor contains the origin", () => {
    expect(primaryFirst([portrait])).toEqual([portrait]);
  });
});

describe("resolveDisplay with a negative-origin monitor", () => {
  const screens = [primary, portrait];
  it("picks the display under the mouse", () => {
    expect(resolveDisplay({ kind: "mouse" }, screens, { x: -700, y: -500 })).toBe(1);
    expect(resolveDisplay({ kind: "mouse" }, screens, { x: 100, y: 100 })).toBe(0);
  });
  it("main is index 0", () => {
    expect(resolveDisplay({ kind: "main" }, screens, { x: 0, y: 0 })).toBe(0);
  });
});
