import { describe, expect, it } from "vitest";
import { applyTextScale, scaleFactor } from "./textScale";

describe("text scale", () => {
  it("maps percent to a factor between 1 and 2.25", () => {
    expect(scaleFactor(100)).toBe(1);
    expect(scaleFactor(150)).toBe(1.5);
    expect(scaleFactor(400)).toBe(2.25);
    expect(scaleFactor(50)).toBe(1);
    expect(scaleFactor("x")).toBe(1);
    expect(scaleFactor(null)).toBe(1);
  });
  it("sets --text-scale on the root", () => {
    const el = document.createElement("div");
    applyTextScale(125, el);
    expect(el.style.getPropertyValue("--text-scale")).toBe("1.25");
  });
});
