import { describe, expect, it } from "vitest";
import { TICK_AMPLITUDE, TICK_VOLUME, makeTickSamples } from "./tickSound";

describe("tick sound", () => {
  const samples = makeTickSamples();
  it("is 40 ms at 44.1 kHz: 1764 samples", () => {
    expect(samples).toHaveLength(1764);
  });
  it("peaks at most 0.18, and 0.18 x 0.5 after the player volume", () => {
    const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeLessThanOrEqual(TICK_AMPLITUDE);
    expect(peak * TICK_VOLUME).toBeLessThanOrEqual(TICK_AMPLITUDE * 0.5);
    expect(peak).toBeGreaterThan(0.05);
  });
  it("starts silent, attacks over 2 ms and decays", () => {
    expect(samples[0]).toBe(0);
    const abs = (a: number, b: number): number => Math.max(...Array.from(samples.slice(a, b)).map(Math.abs));
    expect(abs(0, 88)).toBeGreaterThan(abs(1500, 1764) * 5);
  });
  it("follows the 1200 Hz sine", () => {
    const t = 100 / 44_100; // past the 2 ms attack
    expect(samples[100]).toBeCloseTo(Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-110 * t) * 0.18, 6);
  });
});
