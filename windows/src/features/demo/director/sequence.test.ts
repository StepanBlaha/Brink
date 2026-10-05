import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateMs, runSteps, typingDelay, type DirectorEnv, type Step } from "./sequence";

function recorder(): { env: DirectorEnv; calls: string[]; at: number[] } {
  const calls: string[] = [];
  const at: number[] = [];
  const mark = (c: string) => {
    calls.push(c);
    at.push(Date.now());
  };
  const env: DirectorEnv = {
    cmd: (c) => mark(`cmd:${c}`),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    insert: (t) => mark(`ins:${t}`),
    key: (k, m) => mark(`key:${m ? `${m}+` : ""}${k}`),
    click: (s, w) => mark(`click:${s}${w ? `@${w}` : ""}`),
    focusEditor: () => mark("focus"),
    shot: async (n) => mark(`shot:${n}`),
    mark: async (n) => mark(`mark:${n}`),
    waitMarker: async (n, t) => {
      mark(`wait:${n}:${t}`);
      return true;
    },
    native: async (a) => mark(`native:${a}`),
  };
  return { env, calls, at };
}

describe("runSteps", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it("runs the steps in order and honors waits", async () => {
    const { env, calls, at } = recorder();
    const steps: Step[] = [
      { t: "cmd", v: "strip" },
      { t: "wait", ms: 800 },
      { t: "cmd", v: "peek:a" },
      { t: "wait", ms: 1100 },
      { t: "shot", name: "1-peek" },
    ];
    const done = runSteps(steps, env);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(["cmd:strip"]);
    await vi.advanceTimersByTimeAsync(799);
    expect(calls).toEqual(["cmd:strip"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(["cmd:strip", "cmd:peek:a"]);
    await vi.advanceTimersByTimeAsync(1100);
    await done;
    expect(calls.at(-1)).toBe("shot:1-peek");
    expect(at).toEqual([0, 800, 1900]);
  });

  it("types one character at a time with deterministic pacing", async () => {
    const { env, calls, at } = recorder();
    const done = runSteps([{ t: "type", text: "ab c", delay: 100 }], env);
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(calls).toEqual(["ins:a", "ins:b", "ins: ", "ins:c"]);
    expect(at).toEqual([0, typingDelay(100, 0), typingDelay(100, 0) + typingDelay(100, 1), typingDelay(100, 0) + typingDelay(100, 1) + typingDelay(100, 2)]);
  });

  it("dispatches keys, clicks, natives and handshakes", async () => {
    const { env, calls } = recorder();
    await runSteps(
      [
        { t: "focusEditor" },
        { t: "key", key: "f", mods: "ctrl" },
        { t: "key", key: "Enter" },
        { t: "click", sel: ".x", within: "Row" },
        { t: "native", name: "capture" },
        { t: "mark", name: "ready" },
        { t: "await", name: "go", timeoutMs: 30000 },
      ],
      env,
    );
    expect(calls).toEqual(["focus", "key:ctrl+f", "key:Enter", "click:.x@Row", "native:capture", "mark:ready", "wait:go:30000"]);
  });

  it("stops at the next step after an abort, also while typing", async () => {
    const { env, calls } = recorder();
    const signal = { aborted: false };
    const done = runSteps([{ t: "type", text: "abcdef", delay: 50 }, { t: "cmd", v: "never" }], env, { signal });
    await vi.advanceTimersByTimeAsync(60);
    signal.aborted = true;
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(calls.length).toBeLessThan(6);
    expect(calls).not.toContain("cmd:never");
  });

  it("estimates a script's length from waits and typing", () => {
    const steps: Step[] = [{ t: "wait", ms: 500 }, { t: "type", text: "ab", delay: 100 }, { t: "shot", name: "x" }];
    expect(estimateMs(steps)).toBe(500 + typingDelay(100, 0) + typingDelay(100, 1));
  });
});
