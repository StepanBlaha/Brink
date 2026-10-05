import { useCallback, useEffect, useRef, useState } from "react";
import { useNotchStore } from "../../state/notchStore";
import { applyDebug } from "./debug";
import {
  configureWindow,
  inTauri,
  nativeReduceMotion,
  onEvent,
  releaseFocus,
  requestFocus,
  sendHitRects,
} from "./notchBridge";
import type { Rect } from "./notchGeometry";
import type { NotchLayout } from "./notchLayout";
import { PhaseMachine, type Zones } from "./phaseMachine";
import { usePointer } from "./usePointer";

interface Args {
  layout: NotchLayout;
  hitRects: Rect[];
  zonesAt: (x: number, y: number) => Zones;
  firstPinId: string;
  /** A menu or popover is open: it blocks folding, and an outside click dismisses it first. */
  overlay?: { isOpen: () => boolean; dismiss: () => void };
}

const isTextTarget = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.matches("input, textarea") || t.isContentEditable);

/** Wires the phase machine to the window: pointer, keys, focus, hit rects, placement, debug. */
export function useNotchBindings({ layout, hitRects, zonesAt, firstPinId, overlay }: Args): PhaseMachine {
  const store = useNotchStore;
  const overlayRef = useRef(overlay);
  useEffect(() => {
    overlayRef.current = overlay;
  });
  const [machine] = useState(
    () => new PhaseMachine({ onChange: (s) => store.getState().setPhase(s), isBlocked: () => overlayRef.current?.isOpen() === true }),
  );
  const zonesRef = useRef(zonesAt);
  zonesRef.current = zonesAt;
  const focusTaken = useRef(false);
  const phase = store((s) => s.phase.phase);
  const { edge, size } = store((s) => s.config);
  const pins = layout.pinCount;

  // Window size follows the viewport (Rust sizes the HWND once per placement).
  useEffect(() => {
    const sync = () => store.getState().setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [store]);

  useEffect(() => configureWindow(edge, pins, size), [edge, pins, size]);
  useEffect(() => machine.layoutChanged(), [machine, edge, size, layout.windowSize]);
  useEffect(() => sendHitRects(hitRects, phase === "expanded"), [hitRects, phase]);
  useEffect(() => () => machine.dispose(), [machine]);

  const outside = useCallback(() => {
    const o = overlayRef.current;
    if (o?.isOpen()) o.dismiss();
    else machine.outsideClick();
  }, [machine]);
  usePointer((x, y) => machine.pointerMoved(zonesRef.current(x, y)), outside);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const o = overlayRef.current;
      if (o?.isOpen()) {
        e.preventDefault();
        o.dismiss();
      } else if (store.getState().phase.phase === "expanded") {
        e.preventDefault();
        machine.escape();
      }
    };
    const down = (e: MouseEvent) => {
      // Browser dev only: in Tauri the window is click-through, Rust reports outside clicks.
      if (!inTauri() && e.target === document.querySelector("[data-phase]")) outside();
    };
    const focusIn = (e: FocusEvent) => {
      if (isTextTarget(e.target) && !focusTaken.current) {
        focusTaken.current = true;
        requestFocus();
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("mousedown", down);
    window.addEventListener("focusin", focusIn);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("mousedown", down);
      window.removeEventListener("focusin", focusIn);
    };
  }, [machine, store, outside]);

  useEffect(() => {
    if (phase !== "expanded" && focusTaken.current) {
      focusTaken.current = false;
      releaseFocus();
    }
  }, [phase]);

  useEffect(() => {
    void nativeReduceMotion().then((v) => store.getState().setNativeReduceMotion(v));
    const debug = (cmd: string) => {
      for (const c of cmd.split(/[\s,]+/).filter(Boolean)) {
        applyDebug(c, machine, store.getState().setConfig, firstPinId);
      }
    };
    const w = window as unknown as { __notch?: (c: string) => void };
    if (import.meta.env.DEV) w.__notch = debug;
    const start = store.getState().config.phase;
    if (start) queueMicrotask(() => debug(start));
    const subs = [
      onEvent<boolean>("notch://fullscreen", (on) => store.getState().setHidden(on)),
      onEvent<boolean>("notch://taskbar-overlap", (on) => on && machine.layoutChanged()),
      ...(import.meta.env.DEV ? [onEvent<string>("notch://debug", debug)] : []),
    ].map((p) => p.catch(() => () => undefined));
    return () => {
      for (const s of subs) void s.then((u) => u());
    };
  }, [machine, store, firstPinId]);

  return machine;
}
