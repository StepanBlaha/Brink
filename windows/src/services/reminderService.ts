import type { DueItem } from "../domain/store/dueItem";
import type { Pin } from "../domain/store/pin";
import type { PinSummary } from "../domain/store/pinSummary";
import {
  itemBody, itemPrefix, maxPending, planReminders, snoozePrefix, summaryPrefix,
  type ReminderRequest, type ReminderSettings,
} from "../domain/store/reminderPlanner";
import { isEligible } from "../domain/store/todayAggregator";
import type { NotifyWire } from "../ipc/notifyIpc";
import { toWire } from "../ipc/notifyIpc";

export interface ReminderPorts {
  /** `remindersEnabled` and not demo mode. */
  enabled(): boolean;
  peekEnabled(): boolean;
  settings(): ReminderSettings;
  pins(): Pin[];
  summaries(): Record<string, PinSummary | undefined>;
  pending(): Promise<NotifyWire[]>;
  apply(add: NotifyWire[], remove: string[]): Promise<void>;
  now(): Date;
  /** A reminder fired while Brink runs: unfold the strip with the peek on that pin. */
  peek(pinId: string): void;
  markDone(pinId: string, itemId: string): Promise<boolean>;
  tick(): void;
  openPin(pinId: string): void;
  snoozeSeconds(): number;
}

export const startDelayS = 1.5;
export const settingsDelayS = 0.3;
export const summariesDelayS = 1.0;
const MAX_TIMER_MS = 2 ** 31 - 1;

/** ReminderService.swift: sync the pending toasts with the plan whenever summaries change. */
export class ReminderService {
  private task: ReturnType<typeof setTimeout> | undefined;
  private peekTimer: ReturnType<typeof setTimeout> | undefined;
  private upcoming: ReminderRequest[] = [];

  constructor(private readonly p: ReminderPorts) {}

  start(): void {
    this.scheduleSoon(startDelayS);
  }

  stop(): void {
    clearTimeout(this.task);
    clearTimeout(this.peekTimer);
  }

  settingsDidChange(): void {
    this.scheduleSoon(settingsDelayS);
  }

  /** Debounced: summaries refresh pin by pin, so several land in a burst. */
  summariesDidChange(): void {
    this.scheduleSoon(summariesDelayS);
  }

  private scheduleSoon(delayS: number): void {
    clearTimeout(this.task);
    this.task = setTimeout(() => void this.reschedule(), delayS * 1000);
  }

  /** Runs the sync now (tests, and the debounce timer). */
  async reschedule(): Promise<void> {
    const pending = await this.p.pending();
    const isManaged = (r: NotifyWire): boolean => r.identifier.startsWith(itemPrefix) || r.identifier.startsWith(summaryPrefix);
    const managed = pending.filter(isManaged);
    const snoozes = pending.filter((r) => r.identifier.startsWith(snoozePrefix));
    if (!this.p.enabled()) {
      await this.p.apply([], [...managed, ...snoozes].map((r) => r.identifier));
      this.setUpcoming([]);
      return;
    }
    const summaries = this.p.summaries();
    const pins = this.p.pins().filter(isEligible);
    const known = new Set(pins.filter((x) => summaries[x.id]).map((x) => x.id));
    const items = pins.flatMap((x) => summaries[x.id]?.dueItems ?? []);
    const openIds = new Set(items.map((i) => i.id));

    // Snoozes of items that are now done or gone; keep the rest.
    const stale = snoozes.filter((r) => r.pinId === undefined || r.itemId === undefined || (known.has(r.pinId) && !openIds.has(r.itemId)));
    // Pins whose summary has not loaded yet keep what was scheduled for them.
    const kept = managed.filter((r) => r.identifier.startsWith(itemPrefix) && !known.has(r.pinId ?? ""));
    const reserved = kept.length + snoozes.length - stale.length;
    const titles = Object.fromEntries(pins.map((x) => [x.id, x.title]));
    const plan = planReminders(items, titles, this.p.now(), this.p.settings(), Math.max(maxPending - reserved, 0));

    const keep = new Set([...plan.map((r) => r.identifier), ...kept.map((r) => r.identifier)]);
    const remove = [...stale, ...managed.filter((r) => !keep.has(r.identifier))].map((r) => r.identifier);
    await this.p.apply(plan.map(toWire), remove);
    this.setUpcoming(plan.filter((r) => r.kind === "item"));
  }

  // MARK: peek while running

  private setUpcoming(items: ReminderRequest[]): void {
    this.upcoming = items;
    this.armPeekTimer();
  }

  private armPeekTimer(): void {
    clearTimeout(this.peekTimer);
    this.peekTimer = undefined;
    if (!this.p.enabled() || !this.p.peekEnabled()) return;
    const now = this.p.now().getTime();
    const next = this.upcoming.find((r) => r.fireDate.getTime() > now);
    if (!next) return;
    const delay = next.fireDate.getTime() - now;
    if (delay > MAX_TIMER_MS) return;
    this.peekTimer = setTimeout(() => {
      if (this.p.peekEnabled() && next.pinId) this.p.peek(next.pinId);
      this.upcoming = this.upcoming.filter((r) => r.fireDate.getTime() > next.fireDate.getTime());
      this.armPeekTimer();
    }, delay);
  }

  // MARK: toast actions (brink://notify?action=...)

  async handleAction(action: string, pinId: string, itemId: string): Promise<void> {
    if (action === "done") {
      this.p.tick();
      await this.p.markDone(pinId, itemId);
      await this.p.apply([], [snoozePrefix + itemId]);
    } else if (action === "snooze") {
      await this.snooze(pinId, itemId);
    } else if (pinId !== "") {
      this.p.openPin(pinId); // "open" and a click on the toast itself
    }
  }

  private async snooze(pinId: string, itemId: string): Promise<void> {
    const due = this.findDue(pinId, itemId);
    const pinTitle = this.p.pins().find((x) => x.id === pinId)?.title;
    const request = {
      identifier: snoozePrefix + itemId, kind: "snooze" as const, pinId, itemId,
      title: due?.title ?? "Reminder",
      body: due ? itemBody(due, pinTitle) : (pinTitle ?? "Snoozed"),
      fireDate: new Date(this.p.now().getTime() + this.p.snoozeSeconds() * 1000),
    };
    await this.p.apply([toWire(request)], []);
  }

  private findDue(pinId: string, itemId: string): DueItem | undefined {
    return this.p.summaries()[pinId]?.dueItems.find((i) => i.id === itemId);
  }
}
