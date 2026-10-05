import { describe, expect, it } from "vitest";
import { cacheKey, displayTitle, isFor, sameTarget } from "./rowPageTarget";

describe("rowPageTarget", () => {
  it("title and key", () => {
    const t = { pinId: "p", rowId: "r-1", title: "  " };
    expect(displayTitle(t)).toBe("Untitled");
    expect(displayTitle({ pinId: "p", rowId: "r", title: " Ship it " })).toBe("Ship it");
    expect(cacheKey(t)).toBe("row-r-1");
    expect(isFor(t, "p")).toBe(true);
    expect(isFor(t, "q")).toBe(false);
  });

  it("compares by value", () => {
    const a = { pinId: "p", rowId: "r", title: "t" };
    expect(sameTarget(a, { ...a })).toBe(true);
    expect(sameTarget(a, { ...a, rowId: "x" })).toBe(false);
    expect(sameTarget(a, null)).toBe(false);
  });
});
