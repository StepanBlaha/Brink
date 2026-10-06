import { useEffect } from "react";
import { inTauri, onEvent, type PointerPayload } from "./notchBridge";

/**
 * Pointer position in window-local CSS px. In Tauri the window ignores the mouse outside the
 * shape, so Rust polls the cursor and sends `notch://pointer`; in a browser the DOM does it.
 */
export function usePointer(onMove: (x: number, y: number, inside?: boolean) => void, onOutsideClick: () => void): void {
  useEffect(() => {
    if (!inTauri()) {
      const move = (e: MouseEvent) => onMove(e.clientX, e.clientY);
      const leave = () => onMove(-9999, -9999);
      window.addEventListener("mousemove", move);
      document.addEventListener("mouseleave", leave);
      return () => {
        window.removeEventListener("mousemove", move);
        document.removeEventListener("mouseleave", leave);
      };
    }
    const subs = [
      onEvent<PointerPayload>("notch://pointer", (p) => onMove(p.x, p.y, p.inside)),
      onEvent<null>("notch://outside-click", onOutsideClick),
    ];
    return () => {
      for (const s of subs) void s.then((u) => u());
    };
  }, [onMove, onOutsideClick]);
}
