import { describe, expect, it } from "vitest";
import { parseDeepLink, pinURL } from "./deepLink";

describe("brink:// links", () => {
  it("pin url round trip", () => {
    expect(pinURL("abc-123")).toBe("brink://pin/abc-123");
    expect(parseDeepLink("brink://pin/abc-123")).toEqual({ kind: "pin", pinId: "abc-123" });
    expect(pinURL("")).toBeNull();
    expect(parseDeepLink("brink://pin/")).toBeNull();
    expect(parseDeepLink("https://pin/abc")).toBeNull();
  });
  it("capture carries text, url and pin", () => {
    expect(parseDeepLink("brink://capture?text=Milk")).toEqual({ kind: "capture", text: "Milk" });
    expect(parseDeepLink("brink://capture?text=Read%20this&url=https%3A%2F%2Fa.b%2Fc&pin=p1")).toEqual({
      kind: "capture", text: "Read this", url: "https://a.b/c", pinId: "p1",
    });
    expect(parseDeepLink("brink://capture")).toBeNull();
  });
  it("oauth and notify", () => {
    expect(parseDeepLink("brink://oauth/callback?code=c&state=s")).toEqual({ kind: "oauth", code: "c", state: "s" });
    expect(parseDeepLink("brink://oauth/callback?code=c")).toBeNull();
    expect(parseDeepLink("brink://notify?action=done&pin=p")).toEqual({ kind: "notify", params: { action: "done", pin: "p" } });
  });
  it("rejects junk", () => {
    expect(parseDeepLink("not a url")).toBeNull();
    expect(parseDeepLink("brink://unknown/x")).toBeNull();
  });
});
