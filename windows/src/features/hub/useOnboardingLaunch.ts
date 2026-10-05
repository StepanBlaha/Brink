import { useEffect, useRef } from "react";
import { shouldShowOnboarding } from "../../domain/store/onboarding";
import { launchedAtLogin, windowOpen } from "../../ipc/windowsIpc";
import { isConnected, useAuthStore } from "../../state/authStore";
import { usePinsStore } from "../../state/pinsStore";
import { useSettingsStore } from "../../state/settingsStore";

/** Opens the welcome once per launch when it is due, but never on a start from the Run key. */
export function useOnboardingLaunch(): void {
  const settingsReady = useSettingsStore((s) => s.hydrated);
  const authReady = useAuthStore((s) => s.hydrated);
  const pinsReady = usePinsStore((s) => s.hydrated);
  const ready = settingsReady && authReady && pinsReady;
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const settings = useSettingsStore.getState().settings;
    const due = shouldShowOnboarding({
      onboardingCompleted: settings.onboardingCompleted,
      hasToken: isConnected(useAuthStore.getState().status),
      pinCount: usePinsStore.getState().pins.length,
    });
    if (!due) return;
    void launchedAtLogin()
      .then((auto) => (auto ? undefined : windowOpen("onboarding")))
      .catch(() => {});
  }, [ready]);
}
