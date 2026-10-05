import type { Pin, PinGroup, PinKind } from "./pin";

export interface MiniListSection {
  pinID: string;
  title: string;
  kind: PinKind;
  openCount: number;
}

/** The part of a pin summary the mini-list reads (full type arrives with M6). */
export interface OpenCountSummary {
  openCount: number;
}

/** Pins in the active group (all pins when none or stale), by order then title, with open counts. */
export function miniListSections(
  pins: Pin[],
  summaries: Record<string, OpenCountSummary | undefined>,
  groups: PinGroup[],
  activeGroupID?: string,
): MiniListSection[] {
  const scoped = activeGroupID && groups.some((g) => g.id === activeGroupID)
    ? pins.filter((p) => p.groupId === activeGroupID)
    : pins;
  return [...scoped]
    .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.title < b.title ? -1 : a.title > b.title ? 1 : 0))
    .map((p) => ({ pinID: p.id, title: p.title, kind: p.kind, openCount: summaries[p.id]?.openCount ?? 0 }));
}

export function totalOpen(pins: Pin[], summaries: Record<string, OpenCountSummary | undefined>): number {
  return pins.reduce((n, p) => n + (summaries[p.id]?.openCount ?? 0), 0);
}

/** Tray count text: empty when off or nothing open; the leading space of the Mac title is trimmed on Windows. */
export function statusTitle(total: number, showCount: boolean): string {
  if (!showCount || total <= 0) return "";
  return total > 99 ? "99+" : String(total);
}

/** Tooltip: "Brink" or "Brink · N open". */
export function trayTooltip(total: number, showCount: boolean): string {
  const t = statusTitle(total, showCount);
  return t === "" ? "Brink" : `Brink · ${t} open`;
}

/** Allows at most one event per `minIntervalMs` (the check-off tick). */
export class TickThrottle {
  private last: number | null = null;
  constructor(readonly minIntervalMs = 80) {}
  allow(nowMs: number): boolean {
    if (this.last !== null && nowMs - this.last < this.minIntervalMs) return false;
    this.last = nowMs;
    return true;
  }
}
