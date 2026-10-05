import { describe, expect, it } from "vitest";
import { LEGAL } from "./legalDocs";
import { parseInline, parseLegal } from "./legalMarkdown";

describe("legal markdown", () => {
  it("parses inline styles and links", () => {
    expect(parseInline("a **b** `c` [d](https://x.y) _e_")).toEqual([
      { t: "text", text: "a " }, { t: "bold", text: "b" }, { t: "text", text: " " }, { t: "code", text: "c" },
      { t: "text", text: " " }, { t: "link", text: "d", href: "https://x.y" }, { t: "text", text: " " },
      { t: "italic", text: "e" },
    ]);
  });
  it("snake_case words are not italic", () => {
    expect(parseInline("my_var_name")).toEqual([{ t: "text", text: "my_var_name" }]);
  });
  it("headings, bullets, numbered lines and tables", () => {
    const b = parseLegal("# Title\n\n## Part\n- one\n1. **two**\n| A | B |\n|---|---|\n| x | y |\n");
    expect(b.map((x) => x.kind)).toEqual(["heading", "heading", "bullet", "body", "bullet", "bullet"]);
    expect(b[0]).toMatchObject({ level: 1 });
    expect(b[4]).toEqual({ kind: "bullet", spans: [{ t: "text", text: "A · B" }] });
  });
  it("bundles the three documents, without em dashes", () => {
    for (const d of Object.values(LEGAL)) {
      expect(d.text.length).toBeGreaterThan(100);
      expect(d.text.includes(String.fromCharCode(0x2014))).toBe(false);
    }
    expect(LEGAL.privacy.text).toContain("Privacy Policy");
    expect(LEGAL.notice.text).toContain("Third-Party Notices");
  });
  it("every legal line parses to something", () => {
    for (const d of Object.values(LEGAL)) expect(parseLegal(d.text).length).toBeGreaterThan(3);
  });
});
