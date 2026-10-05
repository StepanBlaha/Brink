import { describe, expect, it } from "vitest";
import { PIN, SCRIPTS, full, screens, warmUp } from "./scripts";
import { estimateMs, type Step } from "./sequence";

const COMMAND = /^(resting|strip|add|(expanded|peek)(:[\w-]+)?|(edge|size|pill|outline|reduce)=\w+)$/;
const ids = new Set<string>(Object.values(PIN));

const all = (steps: Step[]) => steps.filter((s): s is Extract<Step, { t: "cmd" }> => s.t === "cmd");

describe("demo scripts", () => {
  it("only use debug commands the notch understands, with known pins", () => {
    for (const s of [warmUp, full, screens].flatMap(all)) {
      expect(s.v).toMatch(COMMAND);
      const pin = s.v.split(":")[1];
      if (pin) expect(ids.has(pin)).toBe(true);
    }
  });

  it("name every still once and number them", () => {
    for (const steps of [full, screens]) {
      const names = steps.filter((s) => s.t === "shot").map((s) => (s as { name: string }).name);
      expect(new Set(names).size).toBe(names.length);
      for (const n of names) expect(n).toMatch(/^\d-[a-z-]+$/);
    }
    expect(screens.filter((s) => s.t === "shot").length).toBeGreaterThanOrEqual(9);
  });

  it("full mirrors the Mac segments in order", () => {
    const marks = full.filter((s) => s.t === "mark").map((s) => (s as { name: string }).name);
    expect(marks.filter((m) => m.startsWith("seg-"))).toEqual(["seg-peek", "seg-tasks", "seg-editor", "seg-capture", "seg-tray", "seg-outro"]);
  });

  it("start and end at rest so a loop is clean", () => {
    expect(all(full)[0]?.v).toBe("resting");
    expect(all(full).at(-1)?.v).toBe("resting");
    expect(all(screens).at(-1)?.v).toBe("resting");
  });

  it("take a believable time", () => {
    expect(estimateMs(full)).toBeGreaterThan(20_000);
    expect(estimateMs(full)).toBeLessThan(90_000);
    expect(estimateMs(screens)).toBeLessThan(60_000);
  });

  it("register under their names and carry no em dash", () => {
    expect(Object.keys(SCRIPTS).sort()).toEqual(["full", "screens"]);
    expect(JSON.stringify(SCRIPTS)).not.toContain(String.fromCharCode(0x2014));
  });
});
