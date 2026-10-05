import { isoString, snoozeTarget, type SnoozeOption } from "../domain/capture/snooze";
import { toggleOperation } from "../domain/capture/inboxCapture";
import type { Operation } from "../domain/notion/pendingWrite";
import type { Pin } from "../domain/store/pin";
import type { TodayItem } from "../domain/store/todayAggregator";
import type { QueueOutcome } from "../ipc/types";

export interface ItemActionPorts {
  pins(): Pin[];
  submit(op: Operation): Promise<QueueOutcome>;
  toast(message: string, isError: boolean): void;
  /** `pinContentDidChange`: summaries of that pin refresh. */
  contentChanged(pinId: string): void;
  now(): Date;
}

/**
 * The one write path for acting on a single task from outside its own panel (hover peek,
 * notification buttons, the Today view): queue the write, then tell summaries to refresh.
 */
export class ItemActions {
  constructor(private readonly ports: ItemActionPorts) {}

  async markDone(pinId: string, itemId: string): Promise<boolean> {
    const pin = this.ports.pins().find((p) => p.id === pinId);
    const op = pin ? toggleOperation(pin, itemId, true) : null;
    return op ? this.run(op, pinId) : false;
  }

  /** Moves a task's date (Today view snooze). Later today needs a time; the calculator keeps a time of day. */
  async snooze(item: TodayItem, option: SnoozeOption): Promise<boolean> {
    const property = this.ports.pins().find((p) => p.id === item.pinId)?.config?.dateProperty;
    if (!property) return false;
    if (option === "laterToday" && !item.hasTime) return false;
    const target = snoozeTarget(option, item.due, item.hasTime, this.ports.now());
    const op: Operation = {
      kind: "updateProperty", pageId: item.id,
      updates: [{ name: property, value: { type: "date", date: { start: isoString(target.date, target.hasTime) } } }],
    };
    return this.run(op, item.pinId);
  }

  private async run(op: Operation, pinId: string): Promise<boolean> {
    let ok = true;
    try {
      const out = await this.ports.submit(op);
      if (out.kind === "failed") {
        this.ports.toast(out.message, true);
        ok = false;
      }
    } catch (e) {
      this.ports.toast(e instanceof Error ? e.message : String(e), true);
      ok = false;
    }
    this.ports.contentChanged(pinId);
    return ok;
  }
}
