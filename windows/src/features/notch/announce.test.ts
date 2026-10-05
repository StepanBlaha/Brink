import { describe, expect, it } from "vitest";
import { announcement } from "./announce";
import { initialPhaseState } from "./phaseMachine";

const title = (id: string) => (id === "a" ? "Groceries" : undefined);

describe("notch announcements", () => {
  it("names every state", () => {
    expect(announcement(initialPhaseState, title)).toBe("Brink, collapsed");
    expect(announcement({ ...initialPhaseState, phase: "strip" }, title)).toBe("Brink, pinned pages shown");
    expect(announcement({ ...initialPhaseState, phase: "strip", peekPinId: "a" }, title)).toBe("Brink, preview of Groceries");
    expect(announcement({ ...initialPhaseState, phase: "expanded", selectedPinId: "a" }, title)).toBe("Brink, Groceries open");
    expect(announcement({ ...initialPhaseState, phase: "expanded", selectedPinId: "zz" }, title)).toBe("Brink, panel open");
    expect(announcement({ ...initialPhaseState, phase: "expanded", addFlow: true }, title)).toBe("Brink, add a page");
  });
});
