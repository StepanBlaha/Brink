import { demoFinish, type DemoState } from "../demoIpc";
import { createDomEnv } from "./domEnv";
import { SCRIPTS, warmUp } from "./scripts";
import { runSteps, type DirectorEnv } from "./sequence";

type Win = Window & { __notch?: unknown; __demoStop?: () => void; __demoDone?: boolean };

async function until(test: () => boolean, env: DirectorEnv, timeoutMs: number): Promise<boolean> {
  for (let waited = 0; waited < timeoutMs; waited += 100) {
    if (test()) return true;
    await env.sleep(100);
  }
  return test();
}

/**
 * Runs the demo script in the notch window. With a marker folder (the recording script) it
 * handshakes like the Mac: `shot-ready`, waits for `shot-go`, ends with `shot-done` and quits.
 * Without one it plays once and stays open. `script=none` only enables the debug hook.
 */
export async function startDirector(state: DemoState, inTauri: boolean, env?: DirectorEnv): Promise<void> {
  const steps = SCRIPTS[state.script ?? "none"];
  if (!state.enabled || !steps) return;
  const win = window as Win;
  const e = env ?? createDomEnv({ markers: state.markers });
  if (!(await until(() => typeof win.__notch === "function", e, 15_000))) return;
  const signal = { aborted: false };
  win.__demoStop = () => (signal.aborted = true);
  if (inTauri) await runSteps(warmUp, e, { signal });
  if (state.markers) {
    await e.mark("ready");
    await e.waitMarker("go", 30_000);
  }
  await runSteps(steps, e, { signal });
  if (state.markers) {
    await e.mark("done");
    await e.waitMarker("done-done", 120_000);
    await demoFinish().catch(() => undefined);
  }
  win.__demoDone = true;
}
