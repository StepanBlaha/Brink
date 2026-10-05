import { describe, expect, it } from "vitest";
import { makeHarness } from "./engineHarness";

describe("page backup before deleting saves", () => {
  it("backs up the last-known page as markdown before a delete, not before plain edits", async () => {
    const { server, host, engine } = makeHarness();
    const saved: { pageId: string; markdown: string }[] = [];
    engine.api.backupPage = async (pageId, markdown) => { saved.push({ pageId, markdown }); };
    await engine.load();

    host.type(1, 5, " brave");
    await engine.syncNow();
    expect(saved).toEqual([]);

    host.removeParagraph(7); // "Last"
    await engine.syncNow();
    expect(server.writes.some((w) => w.method === "DELETE")).toBe(true);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.pageId).toBe("page-1");
    expect(saved[0]!.markdown).toContain("# Title");
    expect(saved[0]!.markdown).toContain("Hello brave world");
    expect(saved[0]!.markdown).toContain("Last");
    expect(saved[0]!.markdown).toContain("- Parent");
    expect(saved[0]!.markdown).toContain("  - Child");
  });

  it("a failing backup never fails the save", async () => {
    const { server, host, engine } = makeHarness();
    engine.api.backupPage = async () => { throw new Error("disk full"); };
    await engine.load();
    host.removeParagraph(7);
    await engine.syncNow();
    expect(engine.status.t).toBe("saved");
    expect(server.writes.some((w) => w.method === "DELETE")).toBe(true);
  });
});
