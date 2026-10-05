/**
 * Pure sequencing core of the demo director (Mac `DemoDirector`): a timeline is data, the
 * runner awaits one step at a time through an injected environment. No DOM, no timers of its
 * own: tests drive it with fake timers and a recording environment.
 */
export type NativeAction = "capture" | "captureHide" | "tray" | "trayHide";

export type Step =
  | { t: "cmd"; v: string }
  | { t: "wait"; ms: number }
  | { t: "type"; text: string; delay?: number }
  | { t: "key"; key: string; mods?: string }
  | { t: "click"; sel: string; within?: string }
  | { t: "focusEditor" }
  | { t: "shot"; name: string }
  | { t: "mark"; name: string }
  | { t: "await"; name: string; timeoutMs: number }
  | { t: "native"; name: NativeAction };

export interface DirectorEnv {
  /** A `window.__notch(...)` debug command. */
  cmd(command: string): void;
  sleep(ms: number): Promise<void>;
  /** One character into the focused editor. */
  insert(text: string): void;
  key(key: string, mods?: string): void;
  click(sel: string, within?: string): void;
  focusEditor(): void;
  /** Asks the capture side for a still and waits (briefly) until it was taken. */
  shot(name: string): Promise<void>;
  mark(name: string): Promise<void>;
  waitMarker(name: string, timeoutMs: number): Promise<boolean>;
  native(action: NativeAction): Promise<void>;
  log?(line: string): void;
}

/** Human-ish pacing, deterministic so recordings repeat: factors around 1. */
const PACE = [1, 0.8, 1.25, 0.9, 1.1, 0.75, 1.3, 0.95];
export const typingDelay = (base: number, index: number): number => Math.round(base * PACE[index % PACE.length]!);

export async function typeText(text: string, baseDelay: number, env: DirectorEnv, aborted: () => boolean): Promise<void> {
  let i = 0;
  for (const ch of text) {
    if (aborted()) return;
    env.insert(ch);
    await env.sleep(typingDelay(baseDelay, i++));
  }
}

export interface RunOptions {
  signal?: { aborted: boolean };
}

/** Runs the steps in order; stops cleanly at the next step once `signal.aborted`. */
export async function runSteps(steps: readonly Step[], env: DirectorEnv, opts: RunOptions = {}): Promise<void> {
  const aborted = () => opts.signal?.aborted === true;
  for (const step of steps) {
    if (aborted()) return;
    env.log?.(step.t === "cmd" ? `cmd ${step.v}` : step.t);
    switch (step.t) {
      case "cmd":
        env.cmd(step.v);
        break;
      case "wait":
        await env.sleep(step.ms);
        break;
      case "type":
        await typeText(step.text, step.delay ?? 55, env, aborted);
        break;
      case "key":
        env.key(step.key, step.mods);
        break;
      case "click":
        env.click(step.sel, step.within);
        break;
      case "focusEditor":
        env.focusEditor();
        break;
      case "shot":
        await env.shot(step.name);
        break;
      case "mark":
        await env.mark(step.name);
        break;
      case "await":
        await env.waitMarker(step.name, step.timeoutMs);
        break;
      case "native":
        await env.native(step.name);
        break;
    }
  }
}

/** Sum of the declared waits and typing time: how long a script takes without handshakes. */
export function estimateMs(steps: readonly Step[]): number {
  let total = 0;
  for (const s of steps) {
    if (s.t === "wait") total += s.ms;
    if (s.t === "type") [...s.text].forEach((_, i) => (total += typingDelay(s.delay ?? 55, i)));
  }
  return total;
}
