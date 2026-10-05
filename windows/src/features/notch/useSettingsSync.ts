import { useEffect } from "react";
import { availableMonitors, cursorPosition } from "@tauri-apps/api/window";
import { parseDisplayPreference, resolveDisplay, type ScreenInfo } from "../../domain/store/displayPreference";
import { useNotchStore } from "../../state/notchStore";
import { useSettingsStore } from "../../state/settingsStore";
import { inTauri } from "./notchBridge";

const DISPLAY_POLL_MS = 1500;

/** Debug query params (`?edge=left`) still win over settings, for screenshots. */
const overridden = (key: string): boolean => new URLSearchParams(window.location.search).has(key);

/** The monitors Rust lists, in the same order as `available_monitors`. */
export async function listScreens(): Promise<ScreenInfo[]> {
  if (!inTauri()) return [];
  const list = await availableMonitors();
  return list.map((m) => ({
    name: m.name ?? "",
    frame: { x: m.position.x, y: m.position.y, width: m.size.width, height: m.size.height },
  }));
}

/** Applies edge, size, pill, outline and display from settings to the notch window, live. */
export function useSettingsSync(): void {
  const s = useSettingsStore((x) => x.settings);

  useEffect(() => {
    const patch: Record<string, unknown> = {};
    if (!overridden("edge")) patch["edge"] = s.dockEdge;
    if (!overridden("size")) patch["size"] = s.dockSize;
    if (!overridden("pill")) patch["pill"] = s.pillStyle;
    if (!overridden("outline")) patch["outline"] = s.notchOutline;
    useNotchStore.getState().setConfig(patch);
  }, [s.dockEdge, s.dockSize, s.pillStyle, s.notchOutline]);

  useEffect(() => {
    const pref = parseDisplayPreference(s.displayPreference);
    if (pref.kind === "main") {
      useNotchStore.getState().setMonitor(null);
      return;
    }
    let alive = true;
    const resolve = async (): Promise<void> => {
      try {
        const screens = await listScreens();
        const cursor = pref.kind === "mouse" ? await cursorPosition() : { x: 0, y: 0 };
        const idx = resolveDisplay(pref, screens, cursor) ?? null;
        if (alive && idx !== useNotchStore.getState().monitor) useNotchStore.getState().setMonitor(idx);
      } catch {
        // No monitor info (browser dev): keep the primary one.
      }
    };
    void resolve();
    const timer = setInterval(() => void resolve(), DISPLAY_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [s.displayPreference]);
}
