import { describe, expect, it } from "vitest";
import { contents, list, stagger, unfold } from "./motion";

describe("Theme.Motion springs", () => {
  it("match the plan's stiffness and damping", () => {
    expect(unfold.stiffness).toBeCloseTo(102.7, 1);
    expect(unfold.damping).toBeCloseTo(14.59, 2);
    expect(contents.stiffness).toBeCloseTo(171.3, 1);
    expect(contents.damping).toBeCloseTo(20.94, 2);
    expect(list.stiffness).toBeCloseTo(223.8, 1);
    expect(list.damping).toBeCloseTo(24.53, 2);
  });
  it("stagger caps at 0.18 s and is 0 with reduce motion", () => {
    expect(stagger(2, false)).toBeCloseTo(0.09);
    expect(stagger(9, false)).toBe(0.18);
    expect(stagger(3, true)).toBe(0);
  });
});
