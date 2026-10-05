import { describe, expect, it } from "vitest";
import {
  parseDisplayPreference, resolveDisplay, storedDisplayPreference, zeroRect, type DisplayPreference, type ScreenInfo,
} from "./displayPreference";
import { clampPanelSize, hasPanelSize, panelSizeFor, resetPanelSize, setPanelSize, type PanelSizes } from "./panelSize";
import { pillLabel, resolvePillStyle } from "./pillStyle";

describe("Window customization", () => {
  it("clampsPanelSize", () => {
    expect(clampPanelSize({ width: 10, height: 10 }, 800)).toEqual({ width: 300, height: 240 });
    expect(clampPanelSize({ width: 5000, height: 5000 }, 800)).toEqual({ width: 900, height: 800 });
    expect(clampPanelSize({ width: 800, height: 400 }, 800, 600).width).toBe(600);
    // Minimums win over an absurdly small screen.
    expect(clampPanelSize({ width: 500, height: 500 }, 100, 100)).toEqual({ width: 300, height: 240 });
  });

  it("persistsPerPinAndResets", () => {
    let t: PanelSizes = {};
    expect(panelSizeFor(t, "a", 800)).toBeUndefined();
    t = setPanelSize(t, "a", { width: 700, height: 500 }, 800).table;
    t = setPanelSize(t, "b", { width: 320, height: 260 }, 800).table;
    expect(panelSizeFor(t, "a", 800)).toEqual({ width: 700, height: 500 });
    expect(panelSizeFor(t, "b", 800)).toEqual({ width: 320, height: 260 });
    // Stored size is re-clamped when the screen shrinks.
    expect(panelSizeFor(t, "a", 400)?.height).toBe(400);
    // Writes clamp too.
    const c = setPanelSize(t, "c", { width: 9999, height: 1 }, 800);
    expect(c.size).toEqual({ width: 900, height: 240 });
    t = resetPanelSize(c.table, "a");
    expect(panelSizeFor(t, "a", 800)).toBeUndefined();
    expect(hasPanelSize(t, "b")).toBe(true);
  });

  it("migratesRestingPillHidden", () => {
    expect(resolvePillStyle(undefined, true)).toBe("hidden");
    expect(resolvePillStyle(undefined, false)).toBe("line");
    expect(resolvePillStyle(undefined, undefined)).toBe("line");
    expect(resolvePillStyle("dot", true)).toBe("dot");
    expect(resolvePillStyle("bogus", true)).toBe("hidden");
  });

  it("pillLabels", () => {
    expect(pillLabel(7, 12, true)).toBe("7/12");
    expect(pillLabel(7, 12, false)).toBe("58%");
    expect(pillLabel(0, 0, false)).toBe("0%");
    expect(pillLabel(0, 0, true)).toBe("0/0");
  });

  it("displayPreference", () => {
    const screens: ScreenInfo[] = [
      { name: "Built-in", frame: { x: 0, y: 0, width: 1500, height: 900 } },
      { name: "LG", frame: { x: 1500, y: 0, width: 2560, height: 1440 } },
      { name: "LG", frame: { x: 4060, y: 0, width: 2560, height: 1440 } },
    ];
    const main: DisplayPreference = { kind: "main" };
    const mouse: DisplayPreference = { kind: "mouse" };
    expect(resolveDisplay(main, screens, { x: 2000, y: 5 })).toBe(0);
    expect(resolveDisplay(mouse, screens, { x: 2000, y: 5 })).toBe(1);
    expect(resolveDisplay(mouse, screens, { x: -5000, y: 5 })).toBe(0);
    const named: DisplayPreference = { kind: "named", name: "LG", frame: screens[2]!.frame };
    expect(resolveDisplay(named, screens, { x: 0, y: 0 })).toBe(2);
    expect(resolveDisplay({ kind: "named", name: "LG", frame: zeroRect }, screens, { x: 0, y: 0 })).toBe(1);
    expect(resolveDisplay({ kind: "named", name: "Gone", frame: screens[1]!.frame }, screens, { x: 0, y: 0 })).toBe(1);
    expect(resolveDisplay({ kind: "named", name: "Gone", frame: zeroRect }, screens, { x: 0, y: 0 })).toBe(0);
    expect(parseDisplayPreference(storedDisplayPreference(named))).toEqual(named);
    expect(parseDisplayPreference("mouse")).toEqual(mouse);
    expect(parseDisplayPreference(undefined)).toEqual(main);
    expect(resolveDisplay(main, [], { x: 0, y: 0 })).toBeUndefined();
  });

  it("parses Mac-style stored frames with decimals", () => {
    expect(parseDisplayPreference("screen:LG\t1500.0,0.0,2560.0,1440.0")).toEqual({
      kind: "named", name: "LG", frame: { x: 1500, y: 0, width: 2560, height: 1440 },
    });
  });
});
