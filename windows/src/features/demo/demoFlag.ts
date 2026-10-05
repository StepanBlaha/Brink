import { demoState, type DemoState } from "./demoIpc";

/** True in the real Tauri webview; the browser mock also defines `__TAURI_INTERNALS__`, so it sets a marker. */
export const realTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window && !("__BRINK_MOCK_IPC__" in window);
const OFF: DemoState = { enabled: false, baseUrl: null, script: null, markers: false };
let current: DemoState = OFF;

/** The state fetched at startup by `initDemo`; synchronous afterwards. */
export const demoSnapshot = (): DemoState => current;
export const isDemo = (): boolean => current.enabled;

/** Browser dev: `?demo=1` (and `&script=screens`) without Tauri. */
export function demoFromSearch(search: string): DemoState {
  const q = new URLSearchParams(search);
  if (q.get("demo") !== "1") return OFF;
  return { enabled: true, baseUrl: null, script: q.get("script") ?? "none", markers: false };
}

/** Resolves the demo state once before the first render. Never throws. */
export async function initDemo(search = window.location.search): Promise<DemoState> {
  try {
    current = realTauri() ? await demoState() : demoFromSearch(search);
  } catch {
    current = OFF;
  }
  return current;
}

/** Test seam. */
export function setDemoForTest(state: DemoState): void {
  current = state;
}
