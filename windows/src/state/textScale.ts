import { textScale } from "../ipc/windowsIpc";

const POLL_MS = 10_000;

/** Percent from the OS (100 to 225) to the CSS factor, tolerant of junk. */
export function scaleFactor(percent: unknown): number {
  const n = typeof percent === "number" && Number.isFinite(percent) ? percent : 100;
  return Math.min(2.25, Math.max(1, n / 100));
}

export function applyTextScale(percent: unknown, root: HTMLElement = document.documentElement): void {
  root.style.setProperty("--text-scale", String(scaleFactor(percent)));
}

/** Follows the Windows text size setting; re-reads only while the window is visible. */
export function startTextScale(): () => void {
  const read = (): void => {
    if (document.visibilityState === "hidden") return;
    void textScale().then((p) => applyTextScale(p)).catch(() => {});
  };
  read();
  const timer = setInterval(read, POLL_MS);
  return () => clearInterval(timer);
}
