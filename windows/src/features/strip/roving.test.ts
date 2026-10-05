import { describe, expect, it } from "vitest";
import { nextIndex, pinLabel } from "./roving";

describe("strip roving focus", () => {
  it("vertical strip uses up and down and wraps", () => {
    expect(nextIndex("ArrowDown", 0, 3, "vertical")).toBe(1);
    expect(nextIndex("ArrowDown", 2, 3, "vertical")).toBe(0);
    expect(nextIndex("ArrowUp", 0, 3, "vertical")).toBe(2);
    expect(nextIndex("ArrowRight", 0, 3, "vertical")).toBeNull();
  });
  it("top strip uses left and right", () => {
    expect(nextIndex("ArrowRight", 0, 3, "horizontal")).toBe(1);
    expect(nextIndex("ArrowLeft", 0, 3, "horizontal")).toBe(2);
    expect(nextIndex("ArrowDown", 0, 3, "horizontal")).toBeNull();
  });
  it("Home and End jump to the ends, empty strips do nothing", () => {
    expect(nextIndex("Home", 2, 4, "vertical")).toBe(0);
    expect(nextIndex("End", 0, 4, "vertical")).toBe(3);
    expect(nextIndex("ArrowDown", 0, 0, "vertical")).toBeNull();
  });
  it("labels carry the badge count", () => {
    expect(pinLabel("Groceries", 0)).toBe("Groceries");
    expect(pinLabel("Groceries", 1)).toBe("Groceries, 1 item open");
    expect(pinLabel("Sprint", 7)).toBe("Sprint, 7 items open");
  });
});
