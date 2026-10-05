import { useCallback, useRef, useState } from "react";
import { setCapture } from "./notchBridge";
import type { NotchEdge, Size } from "./notchGeometry";

export type ResizeHandle = "farEdge" | "cornerA" | "cornerB";

/**
 * New panel size for a grip drag (DockController.handleResize). Depth follows the cursor 1:1;
 * a corner also grows the length symmetrically about the panel center (2x).
 */
export function resizedSize(edge: NotchEdge, handle: ResizeHandle, start: Size, dx: number, dy: number): Size {
  const size = { ...start };
  const corner = handle !== "farEdge";
  const second = handle === "cornerB";
  if (edge === "right") {
    size.width -= dx;
    if (corner) size.height += (second ? dy : -dy) * 2;
  } else if (edge === "left") {
    size.width += dx;
    if (corner) size.height += (second ? dy : -dy) * 2;
  } else {
    size.height += dy;
    if (corner) size.width += (second ? dx : -dx) * 2;
  }
  return size;
}

interface Args {
  edge: NotchEdge;
  size: Size;
  /** Clamps to the limits and the window's room. */
  clamp: (s: Size) => Size;
  onCommit: (s: Size) => void;
}

/** Live size while a grip is dragged; `committing` stays true so the morph does not animate. */
export function useResize({ edge, size, clamp, onCommit }: Args) {
  const [live, setLive] = useState<Size | null>(null);
  const session = useRef<{ handle: ResizeHandle; x: number; y: number; start: Size } | null>(null);

  const begin = useCallback(
    (handle: ResizeHandle, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      session.current = { handle, x: e.clientX, y: e.clientY, start: size };
      setCapture(true);
      const move = (ev: PointerEvent) => {
        const s = session.current;
        if (s) setLive(clamp(resizedSize(edge, s.handle, s.start, ev.clientX - s.x, ev.clientY - s.y)));
      };
      const up = (ev: PointerEvent) => {
        const s = session.current;
        session.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setCapture(false);
        if (s) onCommit(clamp(resizedSize(edge, s.handle, s.start, ev.clientX - s.x, ev.clientY - s.y)));
        setLive(null);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [edge, size, clamp, onCommit],
  );
  return { live, resizing: live !== null, begin };
}
