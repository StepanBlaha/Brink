import { describe, expect, it } from "vitest";
import { formatMinutes, parseMinutes } from "./time";

describe("summary time", () => {
  it("round trips the default 8:00", () => {
    expect(formatMinutes(480)).toBe("08:00");
    expect(parseMinutes("08:00")).toBe(480);
  });
  it("clamps and rejects", () => {
    expect(formatMinutes(5000)).toBe("23:59");
    expect(formatMinutes(-4)).toBe("00:00");
    expect(parseMinutes("")).toBeNull();
    expect(parseMinutes("24:00")).toBeNull();
    expect(parseMinutes("7:75")).toBeNull();
    expect(parseMinutes("23:59")).toBe(1439);
  });
});
