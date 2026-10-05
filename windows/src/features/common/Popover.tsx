import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Rect } from "../notch/notchGeometry";
import styles from "./common.module.css";

interface Props {
  /** Window-local point the popover opens at (cursor, or the anchor's edge). */
  x: number;
  y: number;
  /** Preferred side: `inward` opens toward the window's center (away from the screen edge). */
  align?: "start" | "end";
  /** Reported after layout so the host can keep the area clickable (hit rects). */
  onRect?: (r: Rect | null) => void;
  label: string;
  children: ReactNode;
}

const MARGIN = 6;

/** A small floating surface clamped inside the window. Dismissal belongs to the host. */
export function Popover({ x, y, align = "start", onRect, label, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const report = useRef(onRect);
  useEffect(() => {
    report.current = onRect;
  });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const { offsetWidth: w, offsetHeight: h } = el;
      const left = Math.min(Math.max(align === "end" ? x - w : x, MARGIN), Math.max(window.innerWidth - w - MARGIN, MARGIN));
      const top = Math.min(Math.max(y, MARGIN), Math.max(window.innerHeight - h - MARGIN, MARGIN));
      setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
      report.current?.({ x: left, y: top, width: w, height: h });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => {
      ro.disconnect();
      report.current?.(null);
    };
  }, [x, y, align]);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={styles.popover}
      style={{ left: pos?.left ?? x, top: pos?.top ?? y, visibility: pos ? "visible" : "hidden" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}
