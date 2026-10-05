import { systemAccent } from "../ipc/windowsIpc";
import { accentHex, hexCss, onAccent } from "../theme/accent";
import { useSettingsStore } from "./settingsStore";
import { visibleInterval } from "../services/visibleInterval";

const SYSTEM_POLL_MS = 5000;

export function applyAccent(hex: number, root: HTMLElement = document.documentElement): void {
  root.style.setProperty("--accent", hexCss(hex));
  root.style.setProperty("--on-accent", onAccent(hex));
}

/**
 * Keeps `--accent` in step with `settings.accentPreset` in this window. The "System accent"
 * preset reads the Windows accent color and re-reads it every few seconds while it is chosen.
 */
export function startAppearance(): () => void {
  let system: number | null = null;
  let timer: (() => void) | undefined;
  const apply = (): void => applyAccent(accentHex(useSettingsStore.getState().settings.accentPreset, system));
  const readSystem = (): void => {
    void systemAccent()
      .then((v) => {
        if (v !== system) {
          system = v;
          apply();
        }
      })
      .catch(() => {});
  };
  const sync = (): void => {
    apply();
    const wantsSystem = useSettingsStore.getState().settings.accentPreset === "system";
    if (wantsSystem && timer === undefined) {
      readSystem();
      timer = visibleInterval(readSystem, SYSTEM_POLL_MS);
    } else if (!wantsSystem && timer !== undefined) {
      timer();
      timer = undefined;
    }
  };
  sync();
  const unsub = useSettingsStore.subscribe((s, prev) => {
    if (s.settings.accentPreset !== prev.settings.accentPreset) sync();
  });
  return () => {
    unsub();
    timer?.();
  };
}
