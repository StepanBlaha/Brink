import type { Block } from "../domain/notion/block";
import type { Row } from "../domain/notion/row";
import type { Pin } from "../domain/store/pin";
import { dayString, summaryFromBlocks, summaryFromRows, type PinSummary } from "../domain/store/pinSummary";
import { useSummaryStore } from "./summaryStore";
import { visibleInterval } from "./visibleInterval";

/** Everything the service needs from the outside (Tauri commands in the app, fakes in tests). */
export interface SummaryPorts {
  pins(): Pin[];
  hasToken(): boolean;
  blockChildren(id: string): Promise<Block[]>;
  /** All rows of the pin's database with the pin's saved filters (done rows included). */
  queryRows(pin: Pin): Promise<Row[]>;
  cachedBlocks(pinId: string): Promise<Block[] | null>;
  cachedRows(pinId: string): Promise<Row[] | null>;
  /** Fired after a summary changed (the reminder service listens, debounced there). */
  changed(): void;
}

/** Page summaries fetch children of up to this many child-bearing blocks. */
export const childFetchLimit = 6;
export const refreshIntervalMs = 300_000;
export const startStaggerS = 0.4;
export const periodicStaggerS = 0.6;
const childTypes = new Set(["toDo", "toggle", "bulletedListItem", "numberedListItem"]);

/** PinSummaryService.swift: cache first, then staggered refreshes, one in flight per pin. */
export class PinSummaryService {
  private started = false;
  private readonly inFlight = new Set<string>();
  private readonly pendingAgain = new Set<string>();
  private timer: (() => void) | undefined;
  private readonly stagger = new Set<ReturnType<typeof setTimeout>>();

  constructor(private readonly ports: SummaryPorts, private readonly now: () => Date = () => new Date()) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    for (const pin of this.ports.pins()) void this.applyCached(pin);
    this.refreshAll(startStaggerS);
    this.timer = visibleInterval(() => this.refreshAll(periodicStaggerS), refreshIntervalMs);
  }

  stop(): void {
    this.started = false;
    this.timer?.();
    this.timer = undefined;
    for (const t of this.stagger) clearTimeout(t);
    this.stagger.clear();
  }

  /** Call when the pin list may have changed (pin added or removed). */
  pinsDidChange(): void {
    if (!this.started) return;
    const pins = this.ports.pins();
    useSummaryStore.getState().prune(new Set(pins.map((p) => p.id)));
    for (const pin of pins) {
      if (useSummaryStore.getState().summaries[pin.id]) continue;
      void this.applyCached(pin);
      this.refresh(pin.id);
    }
    this.ports.changed();
  }

  /** `pinContentDidChange`: one pin, or everything when `pinId` is missing. */
  contentDidChange(pinId?: string): void {
    if (pinId) this.refresh(pinId);
    else this.refreshAll(startStaggerS);
  }

  refreshAll(staggerS: number): void {
    this.ports.pins().forEach((pin, index) => {
      const t = setTimeout(() => {
        this.stagger.delete(t);
        this.refresh(pin.id);
      }, index * staggerS * 1000);
      this.stagger.add(t);
    });
  }

  refresh(pinId: string): void {
    const pin = this.ports.pins().find((p) => p.id === pinId);
    if (!pin || !this.ports.hasToken()) return;
    if (this.inFlight.has(pinId)) {
      this.pendingAgain.add(pinId);
      return;
    }
    this.inFlight.add(pinId);
    void this.compute(pin).then((result) => {
      if (result) {
        useSummaryStore.getState().set(pinId, result);
        this.ports.changed();
      }
      this.inFlight.delete(pinId);
      if (this.pendingAgain.delete(pinId)) this.refresh(pinId);
    });
  }

  private async applyCached(pin: Pin): Promise<void> {
    try {
      if (pin.kind === "page") {
        const blocks = await this.ports.cachedBlocks(pin.id);
        if (blocks) this.setIfAbsent(pin.id, summaryFromBlocks(blocks));
      } else if (pin.config) {
        const rows = await this.ports.cachedRows(pin.id);
        if (rows) this.setIfAbsent(pin.id, summaryFromRows(rows, pin.config, dayString(this.now()), pin.id));
      }
    } catch {
      // A cache miss is fine; the network refresh follows.
    }
  }

  private setIfAbsent(pinId: string, summary: PinSummary): void {
    if (!useSummaryStore.getState().summaries[pinId]) useSummaryStore.getState().set(pinId, summary);
  }

  private async compute(pin: Pin): Promise<PinSummary | null> {
    try {
      if (pin.kind === "page") {
        const all: Block[] = [];
        let fetched = 0;
        for (const block of await this.ports.blockChildren(pin.notionId)) {
          all.push(block);
          if (!block.hasChildren || fetched >= childFetchLimit || !childTypes.has(block.type.kind)) continue;
          fetched += 1;
          all.push(...(await this.ports.blockChildren(block.id).catch(() => [])));
        }
        return summaryFromBlocks(all);
      }
      if (!pin.config) return null;
      return summaryFromRows(await this.ports.queryRows(pin), pin.config, dayString(this.now()), pin.id);
    } catch {
      return null;
    }
  }
}
