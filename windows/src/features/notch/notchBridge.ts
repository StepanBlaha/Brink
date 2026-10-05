import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { NotchEdge, Rect } from "./notchGeometry";

/** Tauri bridge for the notch window. No-ops in a plain browser (Vite dev). */
export const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface PointerPayload {
  inside: boolean;
  x: number;
  y: number;
}

export interface PlacementPayload {
  edge: NotchEdge;
  scale: number;
  windowW: number;
  windowH: number;
}

const SIZE_SCALE = { small: 0.85, medium: 1, large: 1.2 } as const;

export function configureWindow(edge: NotchEdge, pinCount: number, size: keyof typeof SIZE_SCALE): void {
  if (!inTauri()) return;
  void invoke("notch_configure", {
    config: { edge, pinCount, sizeScale: SIZE_SCALE[size], monitor: null },
  });
}

export function sendHitRects(rects: Rect[], expanded: boolean): void {
  if (!inTauri()) return;
  void invoke("notch_set_hit_rects", {
    rects: rects.map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
    expanded,
  });
}

export const setCapture = (on: boolean): void => {
  if (inTauri()) void invoke("notch_capture", { on });
};
export const requestFocus = (): void => {
  if (inTauri()) void invoke("notch_request_focus");
};
export const releaseFocus = (): void => {
  if (inTauri()) void invoke("notch_release_focus");
};
export const nativeReduceMotion = async (): Promise<boolean> =>
  inTauri() ? invoke<boolean>("notch_reduce_motion") : false;

export function onEvent<T>(name: string, fn: (p: T) => void): Promise<UnlistenFn> {
  return listen<T>(name, (e) => fn(e.payload));
}
