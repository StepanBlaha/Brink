import { HOVER_OUT_DELAY_MS, PEEK_DISMISS_MS, PEEK_DWELL_MS } from "../../theme/notchMetrics";

export type NotchPhase = "resting" | "strip" | "expanded";

export interface PhaseState {
  phase: NotchPhase;
  selectedPinId: string | null;
  /** "Keep open": outside click and Esc do not collapse. */
  keepOpen: boolean;
  addFlow: boolean;
  peekPinId: string | null;
}

/** Where the cursor is, in terms of the hot zones of the current layout. */
export interface Zones {
  resting: boolean;
  strip: boolean;
  /** Over the peek card (already outset by 8). */
  peek: boolean;
}

export interface PhaseOptions {
  onChange: (s: PhaseState) => void;
  /** A context menu or popover is open: never fold to resting. */
  isBlocked?: () => boolean;
  hoverOutDelay?: number;
  /** Phase changed: `reason` is hover-in, hover-out, click, outside-click, escape, layout, reminder, timer or debug. */
  onPhase?: (phase: NotchPhase, reason: string) => void;
}

export const initialPhaseState: PhaseState = {
  phase: "resting",
  selectedPinId: null,
  keepOpen: false,
  addFlow: false,
  peekPinId: null,
};

type TimerName = "collapseTimer" | "dwellTimer" | "dismissTimer" | "reminderTimer";

/** A reminder fired: the strip shows the peek card for this long (DockController.peekForReminder). */
export const REMINDER_PEEK_MS = 3000;
/** Gives a freshly unfolded strip time to mount its icons before the card is placed. */
const REMINDER_PEEK_LEAD_MS = 150;

/** DockController's phase logic with its timers. Pure of DOM; drive it with events. */
export class PhaseMachine {
  state: PhaseState = initialPhaseState;
  private zones: Zones = { resting: false, strip: false, peek: false };
  private collapseTimer: ReturnType<typeof setTimeout> | null = null;
  private dwellTimer: ReturnType<typeof setTimeout> | null = null;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private reminderTimer: ReturnType<typeof setTimeout> | null = null;
  private cardHovered = false;

  constructor(private readonly opts: PhaseOptions) {}

  private why = "timer";

  private set(patch: Partial<PhaseState>): void {
    const changed = patch.phase !== undefined && patch.phase !== this.state.phase;
    this.state = { ...this.state, ...patch };
    if (changed) this.opts.onPhase?.(this.state.phase, this.why);
    this.opts.onChange(this.state);
  }

  private clear(t: TimerName): void {
    const h = this[t];
    if (h) clearTimeout(h);
    this[t] = null;
  }

  private setPhase(phase: NotchPhase): void {
    if (phase === this.state.phase) return;
    this.clear("collapseTimer");
    if (phase !== "expanded") {
      this.set({ phase, selectedPinId: null, keepOpen: false, addFlow: false, peekPinId: null });
    } else this.set({ phase, peekPinId: null });
  }

  /** Cursor moved (or the layout changed under it). */
  pointerMoved(z: Zones): void {
    this.zones = z;
    const { phase } = this.state;
    if (phase === "resting") {
      if (z.resting) {
        this.clear("collapseTimer");
        this.why = "hover-in";
        this.setPhase("strip");
      }
    } else if (phase === "strip") {
      if (z.strip || z.peek || this.opts.isBlocked?.()) this.clear("collapseTimer");
      else if (!this.reminderTimer) this.scheduleCollapse();
    } else this.clear("collapseTimer");
  }

  private scheduleCollapse(): void {
    if (this.collapseTimer) return;
    this.collapseTimer = setTimeout(() => {
      this.collapseTimer = null;
      if (this.state.phase !== "strip" || this.opts.isBlocked?.()) return;
      this.why = "hover-out";
      this.setPhase("resting");
    }, this.opts.hoverOutDelay ?? HOVER_OUT_DELAY_MS);
  }

  /** Strip icon, peek card, hotkey, deep link: open `id`, or toggle when already shown. */
  selectPin(id: string): void {
    this.clearPeek();
    this.why = "click";
    const s = this.state;
    if (s.phase === "expanded" && s.selectedPinId === id && !s.addFlow) {
      this.collapse(true);
      return;
    }
    this.clear("collapseTimer");
    this.set({ phase: "expanded", selectedPinId: id, addFlow: false, peekPinId: null });
  }

  openAddFlow(): void {
    this.why = "click";
    this.clearPeek();
    this.clear("collapseTimer");
    this.set({ phase: "expanded", selectedPinId: null, addFlow: true, peekPinId: null });
  }

  /** Leaves expanded: strip when the cursor is in the strip hot zone, else resting. */
  collapse(force: boolean): void {
    const s = this.state;
    if (s.phase !== "expanded" || (!force && s.keepOpen)) return;
    this.setPhase(this.zones.strip ? "strip" : "resting");
  }

  outsideClick(): void {
    this.why = "outside-click";
    this.collapse(false);
  }

  escape(): void {
    this.why = "escape";
    this.collapse(false);
  }

  toggleKeepOpen(): void {
    if (this.state.phase === "expanded") this.set({ keepOpen: !this.state.keepOpen });
  }

  /** Screen, edge or size change: expanded folds to resting. */
  layoutChanged(): void {
    this.why = "layout";
    if (this.state.phase === "expanded") this.setPhase("resting");
  }

  // Peek card (dwell 0.5 s, dismiss 0.3 s). Only in strip phase.
  peekEnter(id: string): void {
    if (this.state.phase !== "strip") return;
    this.clear("dismissTimer");
    this.clear("dwellTimer");
    if (this.state.peekPinId === id) return;
    this.dwellTimer = setTimeout(() => {
      this.dwellTimer = null;
      if (this.state.phase === "strip") this.set({ peekPinId: id });
    }, PEEK_DWELL_MS);
  }

  peekLeave(): void {
    this.clear("dwellTimer");
    if (this.state.peekPinId) this.scheduleDismiss();
  }

  peekCardHover(hovered: boolean): void {
    this.cardHovered = hovered;
    if (hovered) this.clear("dismissTimer");
    else if (this.state.peekPinId) this.scheduleDismiss();
  }

  private scheduleDismiss(): void {
    this.clear("dismissTimer");
    this.dismissTimer = setTimeout(() => {
      this.dismissTimer = null;
      if (!this.cardHovered) this.set({ peekPinId: null });
    }, PEEK_DISMISS_MS);
  }

  private clearPeek(): void {
    this.clear("reminderTimer");
    this.clear("dwellTimer");
    this.clear("dismissTimer");
    this.cardHovered = false;
  }

  /** A reminder fired while running: unfold the strip with the peek card on that pin for 3 s. */
  reminderPeek(id: string): void {
    if (this.state.phase === "expanded") return;
    this.why = "reminder";
    this.clearPeek();
    this.clear("collapseTimer");
    this.clear("reminderTimer");
    if (this.state.phase === "resting") this.setPhase("strip");
    this.reminderTimer = setTimeout(() => {
      this.set({ peekPinId: id });
      this.reminderTimer = setTimeout(() => {
        this.reminderTimer = null;
        if (this.state.peekPinId === id) this.set({ peekPinId: null });
        const z = this.zones;
        this.why = "reminder";
        if (this.state.phase === "strip" && !this.opts.isBlocked?.() && !z.strip && !z.peek) this.setPhase("resting");
      }, REMINDER_PEEK_MS);
    }, REMINDER_PEEK_LEAD_MS);
  }

  // Debug helpers: jump straight to a state (screenshots without moving the real mouse).
  forceResting(): void {
    this.why = "debug";
    this.setPhase("resting");
  }

  forceStrip(): void {
    this.why = "debug";
    if (this.state.phase === "expanded") this.set({ phase: "strip", selectedPinId: null, keepOpen: false, addFlow: false });
    else this.setPhase("strip");
  }

  forcePeek(id: string): void {
    this.set({ peekPinId: id });
  }

  dispose(): void {
    this.clear("collapseTimer");
    this.clear("reminderTimer");
    this.clearPeek();
  }
}
