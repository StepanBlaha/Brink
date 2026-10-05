import { useEffect, useRef } from "react";
import { toastShow } from "../../ipc/captureIpc";
import { on } from "../../ipc/events";
import { notifyStatus } from "../../ipc/notifyIpc";
import { reminderService, setHubActions, sound, summaryService } from "../../services/hub";
import { useAuthStore, isConnected } from "../../state/authStore";
import { useNotchStore } from "../../state/notchStore";
import { usePinsStore } from "../../state/pinsStore";
import { useSettingsStore } from "../../state/settingsStore";
import type { PhaseMachine } from "../notch/phaseMachine";
import { seedDemoSummaries } from "../notch/demoSummaries";
import { isDemoSummaries } from "../../services/demoFlag";
import { isTodayId } from "../strip/pinItems";

export const NOTIFICATIONS_OFF =
  "Notifications are turned off for Brink. Turn them on in Windows Settings, System, Notifications.";

/** Starts the summary and reminder services in the hub window and keeps them in step with the stores. */
export function useSummaryHub(machine: PhaseMachine): void {
  const ref = useRef(machine);
  ref.current = machine;
  const pins = usePinsStore((s) => s.pins);
  const pinsReady = usePinsStore((s) => s.hydrated);
  const connected = useAuthStore((s) => isConnected(s.status));
  const s = useSettingsStore((x) => x.settings);

  useEffect(() => {
    setHubActions({
      openPin: (id) => {
        const st = useSettingsStore.getState().settings;
        const all = usePinsStore.getState().pins;
        if (isTodayId(id)) {
          if (!st.showTodayPin) return;
        } else {
          const pin = all.find((p) => p.id === id);
          if (!pin) return;
          // A pin outside the active group is not in the strip: show every pin.
          if (st.activeGroupID && pin.groupId !== st.activeGroupID) void useSettingsStore.getState().update({ activeGroupID: "" });
        }
        ref.current.selectPin(id);
      },
      peek: (id) => {
        if (usePinsStore.getState().pins.some((p) => p.id === id)) ref.current.reminderPeek(id);
      },
    });
    const subs = [
      on<null>("sound://tick", () => void sound.tick()),
      on<null>("sound://test", () => void sound.play()),
      on<string | { pinId?: string } | null>("pin://content-changed", (p) =>
        summaryService.contentDidChange(typeof p === "string" ? p : (p?.pinId ?? undefined))),
    ];
    const unlock = (): void => sound.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      for (const x of subs) void x.then((f) => f());
    };
  }, []);

  // Startup: cache first, staggered refresh, every 5 min after.
  useEffect(() => {
    if (!pinsReady) return;
    if (isDemoSummaries()) {
      seedDemoSummaries();
      return;
    }
    summaryService.start();
    reminderService.start();
    return () => {
      summaryService.stop();
      reminderService.stop();
    };
  }, [pinsReady]);

  useEffect(() => summaryService.pinsDidChange(), [pins]);
  useEffect(() => {
    if (connected && !isDemoSummaries()) summaryService.contentDidChange();
  }, [connected]);

  // Reminder settings: replan, and check the Windows toast setting when reminders are switched on.
  useEffect(() => {
    reminderService.settingsDidChange();
  }, [s.remindersEnabled, s.reminderHour, s.morningSummaryEnabled, s.morningSummaryMinutes, s.peekForReminders]);
  useEffect(() => {
    if (!s.remindersEnabled) return;
    void notifyStatus().then((status) => {
      if (status === "enabled") return;
      void toastShow(NOTIFICATIONS_OFF, true).catch(() => {});
      void useSettingsStore.getState().update({ remindersEnabled: false });
    });
  }, [s.remindersEnabled]);

  // Closing a panel refreshes that pin (edits made inside it).
  const open = useNotchStore((st) => (st.phase.phase === "expanded" && !st.phase.addFlow ? st.phase.selectedPinId : null));
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (prev.current && prev.current !== open && !isTodayId(prev.current)) summaryService.refresh(prev.current);
    prev.current = open;
  }, [open]);
}
