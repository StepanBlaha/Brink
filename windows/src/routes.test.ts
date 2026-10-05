import { describe, expect, it } from "vitest";
import { parseRoute } from "./routes";

describe("routes", () => {
  it("parses hash routes", () => {
    expect(parseRoute("#/notch")).toEqual({ name: "notch" });
    expect(parseRoute("#/legal/privacy")).toEqual({ name: "legal", arg: "privacy" });
  });
  it("falls back to settings", () => {
    expect(parseRoute("")).toEqual({ name: "settings" });
  });
});
