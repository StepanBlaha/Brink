import { describe, expect, it } from "vitest";
import { ACCENTS, accentHex, hexCss, onAccent } from "./accent";

describe("accent", () => {
  it("has the eleven Mac presets with the Mac hex values", () => {
    expect(ACCENTS).toHaveLength(11);
    expect(accentHex("blue", null)).toBe(0x0a84ff);
    expect(accentHex("offWhite", null)).toBe(0xf2f2f0);
    expect(accentHex("pink", 0x123456)).toBe(0xff375f);
  });
  it("system follows Windows and falls back to blue", () => {
    expect(accentHex("system", 0x0078d4)).toBe(0x0078d4);
    expect(accentHex("system", null)).toBe(0x0a84ff);
  });
  it("formats css and picks readable text", () => {
    expect(hexCss(0x0a84ff)).toBe("#0a84ff");
    expect(hexCss(0x000f0f)).toBe("#000f0f");
    expect(onAccent(0xffd60a)).toBe("#000");
    expect(onAccent(0x0a84ff)).toBe("#fff");
  });
});
