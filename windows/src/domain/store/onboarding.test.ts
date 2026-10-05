import { describe, expect, it } from "vitest";
import { primaryLabel, shouldShowOnboarding } from "./onboarding";

describe("onboarding rules", () => {
  it("shows on first launch", () => {
    expect(shouldShowOnboarding({ onboardingCompleted: false, hasToken: true, pinCount: 3 })).toBe(true);
  });
  it("shows again when there is no token and no pins", () => {
    expect(shouldShowOnboarding({ onboardingCompleted: true, hasToken: false, pinCount: 0 })).toBe(true);
  });
  it("stays away once set up", () => {
    expect(shouldShowOnboarding({ onboardingCompleted: true, hasToken: false, pinCount: 2 })).toBe(false);
    expect(shouldShowOnboarding({ onboardingCompleted: true, hasToken: true, pinCount: 0 })).toBe(false);
  });
  it("labels the primary button", () => {
    expect(primaryLabel(0, false)).toBe("Get started");
    expect(primaryLabel(1, false)).toBe("Skip for now");
    expect(primaryLabel(1, true)).toBe("Continue");
    expect(primaryLabel(2, true)).toBe("Add a page");
  });
});
