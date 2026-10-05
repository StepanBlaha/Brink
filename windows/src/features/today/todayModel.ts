import type { SnoozeOption } from "../../domain/capture/snooze";
import { startOfDay } from "../../domain/capture/snooze";
import { digestItems, type TodayDigest, type TodayItem, type TodaySection } from "../../domain/store/todayAggregator";
import { Observable } from "../common/observable";

/** Ticked rows stay struck through this long before they leave (TodayModel.swift). */
export const TICKED_LINGER_MS = 450;
/** Fresh data while the Today panel is open. */
export const REFRESH_EVERY_MS = 30_000;

export interface TodayPorts {
  digest(): TodayDigest;
  tick(): void;
  markDone(pinId: string, itemId: string): Promise<boolean>;
  snooze(item: TodayItem, option: SnoozeOption): Promise<boolean>;
}

/**
 * State for the Today panel: rows just ticked or snoozed that are on their way out,
 * while the summaries catch up with the write.
 */
export class TodayModel extends Observable {
  private checked = new Set<string>();
  private gone = new Set<string>();

  constructor(private readonly ports: TodayPorts) {
    super();
  }

  isChecked = (id: string): boolean => this.checked.has(id);

  /** The digest without rows that already left. */
  visibleSections(): TodaySection[] {
    return this.ports.digest().sections.flatMap((s) => {
      const items = s.items.filter((i) => !this.gone.has(i.id));
      return items.length === 0 ? [] : [{ ...s, items }];
    });
  }

  openCount(): number {
    return this.visibleSections().reduce((n, s) => n + s.items.length, 0);
  }

  toggleDone(item: TodayItem): void {
    if (this.checked.has(item.id)) return;
    this.ports.tick();
    this.checked.add(item.id);
    this.emit();
    setTimeout(() => {
      if (!this.checked.has(item.id)) return; // the write failed meanwhile
      this.gone.add(item.id);
      this.emit();
    }, TICKED_LINGER_MS);
    void this.ports.markDone(item.pinId, item.id).then((ok) => {
      if (ok) return;
      this.checked.delete(item.id);
      this.gone.delete(item.id);
      this.emit();
    });
  }

  snooze(item: TodayItem, option: SnoozeOption): void {
    // Later today keeps the row (its time only moves); the others move it out of today.
    const leaves = option !== "laterToday";
    if (leaves) {
      this.gone.add(item.id);
      this.emit();
    }
    void this.ports.snooze(item, option).then((ok) => {
      if (ok || !leaves) return;
      this.gone.delete(item.id);
      this.emit();
    });
  }

  /** Forget ids that the summaries no longer contain. */
  prune(): void {
    const present = new Set(digestItems(this.ports.digest()).map((i) => i.id));
    const keep = (s: Set<string>): Set<string> => new Set([...s].filter((id) => present.has(id)));
    this.checked = keep(this.checked);
    this.gone = keep(this.gone);
    this.emit();
  }
}

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** TodayRow.dateLabel: "Today" (date-only), a time, "Yesterday", or `ddd d MMM` plus the time. */
export function todayDateLabel(due: Date, hasTime: boolean, now: Date): string {
  const time = hasTime ? due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  const dayDiff = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / 86_400_000);
  let day: string | null;
  if (dayDiff === 0) day = hasTime ? null : "Today";
  else if (dayDiff === -1) day = "Yesterday";
  else day = `${days[due.getDay()]} ${due.getDate()} ${months[due.getMonth()]}`;
  return [day, time].filter((x) => x !== null).join(" ");
}
