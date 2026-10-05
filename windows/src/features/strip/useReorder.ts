import { useCallback, useEffect, useRef, useState } from "react";
import { setCapture } from "../notch/notchBridge";
import { dragTargetIndex, shiftOffset } from "./pinItems";

/** Pointer travel before a press becomes a drag; a smaller move stays a click (ReorderableStrip). */
export const DRAG_THRESHOLD = 4;

interface Args {
  count: number;
  /** Icon size plus spacing. */
  stride: number;
  horizontal: boolean;
  canDrag: (index: number) => boolean;
  onDrop: (from: number, to: number) => void;
}

interface Drag {
  index: number;
  translation: number;
}

export interface Reorder {
  dragIndex: number | null;
  /** CSS translate for the slot at `index` (the dragged icon follows the pointer). */
  offsetFor: (index: number) => number;
  /** Props for the draggable slot. */
  bind: (index: number) => { onPointerDown: (e: React.PointerEvent) => void; onClickCapture: (e: React.MouseEvent) => void };
}

/** Drag-to-reorder with plain pointer events (no HTML5 drag session). */
export function useReorder({ count, stride, horizontal, canDrag, onDrop }: Args): Reorder {
  const [drag, setDrag] = useState<Drag | null>(null);
  const press = useRef<{ index: number; start: number; dragging: boolean } | null>(null);
  const suppressClick = useRef(false);
  const latest = useRef({ count, stride, horizontal, canDrag, onDrop });
  useEffect(() => {
    latest.current = { count, stride, horizontal, canDrag, onDrop };
  });

  const finish = useCallback((cancel: boolean, translation: number) => {
    const p = press.current;
    press.current = null;
    if (!p?.dragging) return;
    setCapture(false);
    setDrag(null);
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    const { count: n, stride: s, onDrop: drop } = latest.current;
    const to = dragTargetIndex(p.index, translation, s, n);
    if (!cancel && to !== p.index) drop(p.index, to);
  }, []);

  useEffect(() => {
    let last = 0;
    const axis = (e: PointerEvent) => (latest.current.horizontal ? e.clientX : e.clientY);
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      last = axis(e) - p.start;
      if (!p.dragging) {
        if (Math.abs(last) < DRAG_THRESHOLD) return;
        p.dragging = true;
        setCapture(true);
      }
      setDrag({ index: p.index, translation: last });
    };
    const up = () => finish(false, last);
    const key = (e: KeyboardEvent) => e.key === "Escape" && press.current?.dragging && finish(true, 0);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
    };
  }, [finish]);

  const target = drag ? dragTargetIndex(drag.index, drag.translation, stride, count) : null;
  const offsetFor = (index: number): number => {
    if (!drag || target === null) return 0;
    return index === drag.index ? drag.translation : shiftOffset(index, drag.index, target, stride);
  };
  const bind: Reorder["bind"] = (index) => ({
    onPointerDown: (e) => {
      if (e.button !== 0 || !canDrag(index)) return;
      press.current = { index, start: horizontal ? e.clientX : e.clientY, dragging: false };
    },
    onClickCapture: (e) => {
      if (suppressClick.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  });
  return { dragIndex: drag?.index ?? null, offsetFor, bind };
}
