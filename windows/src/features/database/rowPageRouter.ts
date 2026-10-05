import { emit } from "@tauri-apps/api/event";
import { Observable } from "../common/observable";
import { isFor, sameTarget, type RowPageTarget } from "./rowPageTarget";

export const OPEN_PIN_EVENT = "notch://open-pin";
/** Sent by other windows (tray flyout) to the hub, which opens the row in the notch. */
export const OPEN_ROW_EVENT = "notch://open-row";
export const PENDING_EXPIRY_MS = 3000;

/**
 * Opens a database row in the side view (port of RowPageRouter). Surfaces outside the panel
 * (Today, hover peek, tray) call `open`, which asks the notch to open the pin and leaves the row
 * for the pin's view to pick up with `take`.
 */
export class RowPageRouter extends Observable {
  private pendingTarget: RowPageTarget | null = null;

  constructor(
    private readonly askOpenPin: (pinId: string) => void = (pinId) => void emit(OPEN_PIN_EVENT, { pinId }).catch(() => {}),
    private readonly expiryMs = PENDING_EXPIRY_MS,
  ) {
    super();
  }

  get pending(): RowPageTarget | null {
    return this.pendingTarget;
  }

  /** Opens `target.pinId` in the notch, then its row page. */
  open(target: RowPageTarget): void {
    this.pendingTarget = target;
    this.emit();
    this.askOpenPin(target.pinId);
    // A request nobody picks up (pin gone, panel refused) must not fire on a later open.
    setTimeout(() => {
      if (sameTarget(this.pendingTarget, target)) this.clear();
    }, this.expiryMs);
  }

  /** Takes the waiting row if it is for this pin. */
  take(forPin: string): RowPageTarget | null {
    const t = this.pendingTarget;
    if (!t || !isFor(t, forPin)) return null;
    this.clear();
    return t;
  }

  private clear(): void {
    this.pendingTarget = null;
    this.emit();
  }
}

export const rowPageRouter = new RowPageRouter();
