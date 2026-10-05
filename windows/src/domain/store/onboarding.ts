/** First launch, or nothing to show yet (no token and no pins) (Onboarding.shouldShow). */
export function shouldShowOnboarding(s: { onboardingCompleted: boolean; hasToken: boolean; pinCount: number }): boolean {
  return !s.onboardingCompleted || (!s.hasToken && s.pinCount === 0);
}

export const ONBOARDING_STEPS = 3;

/** Primary footer button per step (OnboardingView.footer). */
export function primaryLabel(step: number, hasToken: boolean): string {
  if (step === 0) return "Get started";
  if (step === 1) return hasToken ? "Continue" : "Skip for now";
  return "Add a page";
}
