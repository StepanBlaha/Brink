import { describe, expect, it } from "vitest";
import { appURL, compactID, preferredURL, webURL } from "./notionLink";

describe("notionLink", () => {
  it("compactID drops dashes", () => {
    expect(compactID("12ab-34cd-56ef")).toBe("12ab34cd56ef");
    expect(compactID("plain")).toBe("plain");
  });

  it("builds app and web URLs", () => {
    expect(appURL("a-b")).toBe("notion://www.notion.so/ab");
    expect(webURL("a-b")).toBe("https://www.notion.so/ab");
  });

  it("preferredURL follows the app install", () => {
    expect(preferredURL("a-b", true)).toBe("notion://www.notion.so/ab");
    expect(preferredURL("a-b", false)).toBe("https://www.notion.so/ab");
  });
});
