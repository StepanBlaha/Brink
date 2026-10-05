import { describe, expect, it } from "vitest";
import { SoundService, type AudioPort } from "./sound";

function fake() {
  const played: number[] = [];
  const port: AudioPort = { state: "running", resume: async () => {}, playBuffer: (s, _r, v) => played.push(s.length * v) };
  return { played, port };
}

describe("SoundService", () => {
  it("throttles to one tick per 80 ms", () => {
    const { port, played } = fake();
    let t = 1000;
    const s = new SoundService(() => true, () => port, () => t);
    expect([s.tick(), (t += 79, s.tick()), (t += 1, s.tick())]).toEqual([true, false, true]);
    expect(played).toHaveLength(2);
  });
  it("tick respects soundsEnabled, play ignores it", () => {
    const { port, played } = fake();
    let t = 0;
    const s = new SoundService(() => false, () => port, () => (t += 100));
    expect(s.tick()).toBe(false);
    expect(s.play()).toBe(true);
    expect(played).toHaveLength(1);
  });
  it("plays at volume 0.5", () => {
    const { port, played } = fake();
    new SoundService(() => true, () => port, () => 0).tick();
    expect(played[0]).toBe(1764 * 0.5);
  });
  it("is silent without audio support", () => {
    expect(new SoundService(() => true, () => null, () => 0).tick()).toBe(false);
  });
});
