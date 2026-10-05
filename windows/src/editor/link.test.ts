import { describe, expect, it } from "vitest";
import { block, PMHost } from "../test/pmHost";
import { linkAt, normalizeLink, setLink } from "./plugins/link";

describe("links", () => {
  it("normalizes: bare hosts get https, empty removes", () => {
    expect(normalizeLink(" example.com ")).toBe("https://example.com");
    expect(normalizeLink("http://a.b")).toBe("http://a.b");
    expect(normalizeLink("  ")).toBeNull();
  });
  it("sets, reads and removes a link over a selection; the planner sees spans with the link", () => {
    const h = new PMHost([block("a", "see the plan now")]);
    h.select(5, 13);
    h.view.dispatch(setLink(h.state, 5, 13, "https://example.com"));
    expect(linkAt(h.state)).toBe("https://example.com");
    expect(h.doc.paragraphs()[0]!.spans.map((s) => [s.text, s.link])).toEqual([
      ["see ", undefined], ["the plan", "https://example.com"], [" now", undefined],
    ]);
    h.view.dispatch(setLink(h.state, 5, 13, null));
    expect(h.doc.paragraphs()[0]!.spans).toHaveLength(1);
  });
});
