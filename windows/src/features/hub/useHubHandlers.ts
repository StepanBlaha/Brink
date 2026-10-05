import { useEffect, useRef } from "react";
import { queueSubmit } from "../../ipc/commands";
import { captureEvents, clipboardRead, deeplinkReady, toastShow, traySetCount, type HotkeyFired } from "../../ipc/captureIpc";
import { hotkeysStatus } from "../../ipc/hotkeysIpc";
import { on } from "../../ipc/events";
import { useGroupsStore } from "../../state/groupsStore";
import { usePinsStore } from "../../state/pinsStore";
import { useSettingsStore } from "../../state/settingsStore";
import { statusTitle, totalOpen } from "../../domain/store/miniList";
import { activePins } from "../strip/pinItems";
import type { PhaseMachine } from "../notch/phaseMachine";
import { clipboardAppend } from "./clipboardAppend";
import { handleDeepLink } from "./deepLinkHandler";
import { reminderService, summaryService } from "../../services/hub";
import { useSummaryStore } from "../../services/summaryStore";
import { useSummaryHub } from "./useSummaryHub";
import { useOnboardingLaunch } from "./useOnboardingLaunch";
import { OPEN_PIN_EVENT, OPEN_ROW_EVENT, rowPageRouter } from "../database/rowPageRouter";
import type { RowPageTarget } from "../database/rowPageTarget";
import { OPEN_ADD_EVENT } from "../../ipc/windowsIpc";
import { startSummaryBroadcast } from "../../services/summaryBridge";

const toast = (message: string, isError: boolean): void => void toastShow(message, isError).catch(() => {});
const contentChanged = (pinId?: string): void => summaryService.contentDidChange(pinId);

/** Where a hotkey or `brink://pin` lands: the active group's real pins (Today excluded). */
function realPins() {
  const pins = usePinsStore.getState().pins;
  const groups = useGroupsStore.getState().groups;
  return activePins(pins, groups, useSettingsStore.getState().settings.activeGroupID);
}

/** The notch window is the hub (D6): hotkeys, deep links, clipboard append and the tray count. */
export function useHubHandlers(machine: PhaseMachine, opts: { onOpenAdd?: () => void } = {}): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const ref = useRef(machine);
  ref.current = machine;
  const settings = useSettingsStore((s) => s.settings);

  useEffect(() => {
    const openPin = (id: string): void => ref.current.selectPin(id);
    const subs = [
      on<HotkeyFired>(captureEvents.hotkeyFired, (e) => {
        if (e.action === "toggleLastPin") {
          const list = realPins();
          const last = useSettingsStore.getState().settings.lastOpenedPinID;
          const target = list.find((p) => p.id === last) ?? list[0];
          if (target) openPin(target.id);
        } else if (e.action === "openPinN") {
          const target = realPins()[e.index ?? -1];
          if (target) openPin(target.id);
        } else if (e.action === "clipboardAppend") {
          void clipboardAppend({
            pins: () => usePinsStore.getState().pins,
            settings: () => useSettingsStore.getState().settings,
            readClipboard: clipboardRead,
            submit: (op) => queueSubmit(op),
            toast,
            contentChanged,
          });
        }
      }),
      on<{ action: string; accelerator: string }>(captureEvents.hotkeyFailed, (e) =>
        toast(`${e.accelerator} is used by another app. Pick a different shortcut in Settings.`, true)),
      on<{ pinId: string }>(OPEN_PIN_EVENT, (e) => openPin(e.pinId)),
      // Tray flyout: a database row opens as a page in its pin's panel.
      on<RowPageTarget>(OPEN_ROW_EVENT, (t) => rowPageRouter.open(t)),
      on<{ url: string } | string>(captureEvents.deeplink, (e) => {
        void handleDeepLink(typeof e === "string" ? e : e.url, {
          pins: () => usePinsStore.getState().pins,
          quickCaptureLastPinId: () => useSettingsStore.getState().settings.quickCaptureLastPinID,
          openPin,
          submit: (op) => queueSubmit(op),
          toast,
          contentChanged,
          now: () => new Date(),
          notify: (q) => void reminderService.handleAction(q["action"] ?? "open", q["pinId"] ?? "", q["itemId"] ?? ""),
        });
      }),
      // Onboarding "Add a page": open the add flow.
      on<null>(OPEN_ADD_EVENT, () => {
        optsRef.current.onOpenAdd?.();
        ref.current.openAddFlow();
      }),
    ];
    // Startup registration failures fire before the UI listens: read the status once.
    void (async () => {
      const failed = (await hotkeysStatus()).filter((r) => !r.ok && r.error === "inUse");
      if (failed.length === 0) return;
      const hk = useSettingsStore.getState().settings.hotkeys;
      for (const r of failed) {
        toast(`${hk[r.action] ?? r.action} is used by another app. Pick a different shortcut in Settings.`, true);
      }
    })();
    // Flush URLs that arrived before the listeners existed.
    void Promise.all(subs).then(() => deeplinkReady()).catch(() => {});
    return () => {
      for (const s of subs) void s.then((f) => f());
    };
  }, []);

  // Remember the opened pin under the key every reader uses (plan 9 item 2).
  const selected = useSelectedExpandedPin();
  useEffect(() => {
    if (selected && selected !== useSettingsStore.getState().settings.lastOpenedPinID) {
      void useSettingsStore.getState().update({ lastOpenedPinID: selected });
    }
  }, [selected]);

  // Tray tooltip count.
  const pins = usePinsStore((s) => s.pins);
  const summaries = useSummaryStore((s) => s.summaries);
  useEffect(() => {
    const text = statusTitle(totalOpen(pins, summaries), settings.menuBarShowOpenCount);
    void traySetCount(text).catch(() => {});
  }, [pins, summaries, settings.menuBarShowOpenCount]);

  useSummaryHub(machine);
  useOnboardingLaunch();
  useEffect(() => startSummaryBroadcast(), []);
}

import { useNotchStore } from "../../state/notchStore";

function useSelectedExpandedPin(): string | null {
  return useNotchStore((s) => (s.phase.phase === "expanded" && !s.phase.addFlow ? s.phase.selectedPinId : null));
}
