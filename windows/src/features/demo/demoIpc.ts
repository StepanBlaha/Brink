import { invoke } from "@tauri-apps/api/core";

/** Mirror of the Rust `DemoState` (`demo_state`). */
export interface DemoState {
  enabled: boolean;
  baseUrl: string | null;
  script: string | null;
  /** A marker folder is set: the director handshakes with the capture script. */
  markers: boolean;
}

export const demoState = (): Promise<DemoState> => invoke<DemoState>("demo_state");
/** Writes `shot-<name>` into the marker folder (no-op without one). */
export const demoMark = (name: string): Promise<void> => invoke("demo_mark", { name });
/** Waits for `shot-<name>`; false on timeout. */
export const demoWait = (name: string, timeoutMs: number): Promise<boolean> =>
  invoke<boolean>("demo_wait", { name, timeoutMs });
/** Quits the demo (Rust removes the temp folder). */
export const demoFinish = (): Promise<void> => invoke("demo_finish");
