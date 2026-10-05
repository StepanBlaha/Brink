import { decodeBlocks } from "../domain/notion/block";
import { filterJSON } from "../domain/notion/viewFilter";
import { decodeRows } from "../domain/notion/row";
import { reminderSettings } from "../domain/store/reminderPlanner";
import { cacheLoad, notionBlockChildren, notionQueryDataSource, queueSubmit } from "../ipc/commands";
import { toastShow } from "../ipc/captureIpc";
import { notifyApply, notifyPending, type NotifyWire } from "../ipc/notifyIpc";
import { isDemoSummaries } from "./demoFlag";
import { isConnected, useAuthStore } from "../state/authStore";
import { usePinsStore } from "../state/pinsStore";
import { useSettingsStore } from "../state/settingsStore";
import { ItemActions } from "./itemActions";
import { PinSummaryService } from "./pinSummaryService";
import { ReminderService } from "./reminderService";
import { SoundService } from "./sound";
import { useSummaryStore } from "./summaryStore";

const settings = () => useSettingsStore.getState().settings;
const pins = () => usePinsStore.getState().pins;

/** Demo mode never schedules notifications (plan 3.f); the flag arrives with M9, `?demo=1` until then. */
export const isDemo = (): boolean => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");

/** Debug builds can shorten the 1 hour snooze: `localStorage.setItem("brink.debug.snoozeSeconds", "20")`. */
function snoozeSeconds(): number {
  if (import.meta.env.DEV) {
    const n = Number(globalThis.localStorage?.getItem("brink.debug.snoozeSeconds"));
    if (n > 0) return n;
  }
  return 3600;
}

/** The hub window's services (D6). Other windows send events; only the hub talks to these. */
export const sound = new SoundService(() => settings().soundsEnabled);

export const summaryService = new PinSummaryService({
  pins,
  hasToken: () => isConnected(useAuthStore.getState().status) && !isDemoSummaries(),
  blockChildren: notionBlockChildren,
  queryRows: (pin) =>
    notionQueryDataSource(pin.notionId, pin.config?.filters ? filterJSON(pin.config.filters) : null, null),
  cachedBlocks: async (id) => {
    const json = await cacheLoad(id, "blocks");
    return json === null ? null : decodeBlocks(json);
  },
  cachedRows: async (id) => {
    const json = await cacheLoad(id, "rows");
    return json === null ? null : decodeRows(json);
  },
  changed: () => reminderService.summariesDidChange(),
});

export const itemActions = new ItemActions({
  pins,
  submit: (op) => queueSubmit(op),
  toast: (m, e) => void toastShow(m, e).catch(() => {}),
  contentChanged: (id) => summaryService.contentDidChange(id),
  now: () => new Date(),
});

let openPinHandler: (pinId: string) => void = () => {};
let peekHandler: (pinId: string) => void = () => {};
/** The hub root registers how a pin opens and how the reminder peek shows. */
export function setHubActions(a: { openPin: (id: string) => void; peek: (id: string) => void }): void {
  openPinHandler = a.openPin;
  peekHandler = a.peek;
}

export const reminderService = new ReminderService({
  enabled: () => settings().remindersEnabled && !isDemo(),
  peekEnabled: () => settings().peekForReminders,
  settings: () =>
    reminderSettings({
      dateOnlyHour: settings().reminderHour,
      morningSummaryEnabled: settings().morningSummaryEnabled,
      morningSummaryMinutes: settings().morningSummaryMinutes,
    }),
  pins,
  summaries: () => useSummaryStore.getState().summaries,
  pending: notifyPending,
  apply: (add: NotifyWire[], remove: string[]) => notifyApply(add, remove),
  now: () => new Date(),
  peek: (id) => peekHandler(id),
  markDone: (p, i) => itemActions.markDone(p, i),
  tick: () => void sound.tick(),
  openPin: (id) => openPinHandler(id),
  snoozeSeconds,
});
