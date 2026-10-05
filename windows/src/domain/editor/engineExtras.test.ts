import { describe, expect, it } from "vitest";
import { K } from "../markdown/paragraphKind";
import { at, makeHarness } from "./engineHarness";

describe("PageEditorEngine: Windows fixes and extras", () => {
  it("mass-delete guard counts nested children (PORT 9.3): one parent with many children trips it", async () => {
    const { server, host, engine } = makeHarness({ seed: false });
    server.seed("page-1", [
      { id: "keep", type: "paragraph", text: "keep" },
      { id: "p", type: "bulleted_list_item", text: "parent" },
      { id: "x", type: "paragraph", text: "tail" },
    ]);
    server.seed("p", [1, 2, 3, 4, 5].map((n) => ({ id: `c${n}`, type: "paragraph", text: `c${n}` })));
    await engine.load();
    server.clearLog();
    host.removeParagraph(1); // the parent (the children go with it: only the top-most is a delete op)
    for (let i = 5; i >= 1; i--) host.removeParagraph(i);
    await engine.syncNow();
    expect(server.writes).toEqual([]);
    expect(engine.pendingMassDelete).toBe(6);
  });

  it("underline and color survive an edit (PORT 9.12)", async () => {
    const { server, host, engine } = makeHarness({ seed: false });
    server.seed("page-1", [{
      id: "u", type: "paragraph", text: null,
      extra: { rich_text: [{ type: "text", text: { content: "Hi" }, plain_text: "Hi", annotations: { underline: true, color: "red" } }] },
    }]);
    await engine.load();
    expect(engine.previous[0]!.spans[0]).toMatchObject({ underline: true, color: "red" });
    server.clearLog();
    host.type(0, 2, "!");
    await engine.syncNow();
    expect(server.writes.map((w) => w.description)).toEqual(["PATCH /v1/blocks/u"]);
    expect(at(server.writes[0]!.body, "paragraph", "rich_text", 0, "annotations", "underline")).toBe(true);
    expect(at(server.writes[0]!.body, "paragraph", "rich_text", 0, "annotations", "color")).toBe("red");
  });

  it("an underlined block that was only loaded produces no ops", async () => {
    const { server, host, engine } = makeHarness({ seed: false });
    server.seed("page-1", [{
      id: "u", type: "paragraph", text: null,
      extra: { rich_text: [{ type: "text", text: { content: "Hi" }, plain_text: "Hi", annotations: { underline: true } }] },
    }]);
    await engine.load();
    expect(host.paragraphs()[0]!.content).not.toBe("Hi");
    server.clearLog();
    await engine.syncNow();
    expect(server.writes).toEqual([]);
  });

  it("an update to a block deleted in Notion is re-inserted on the next pass", async () => {
    const { server, host, engine } = makeHarness();
    await engine.load();
    server.clearLog();
    server.blocks.delete("p1");
    server.children.set("page-1", server.childIds("page-1").filter((c) => c !== "p1"));
    host.type(1, 11, "!");
    await engine.syncNow();
    expect(server.writes.map((w) => w.description)).toEqual(["PATCH /v1/blocks/p1", "PATCH /v1/blocks/page-1/children"]);
    expect(server.plainText("new-1")).toBe("Hello world!");
    expect(engine.status.t).toBe("saved");
  });

  it("the editor-doc cache holds plain text and paints before the server answers (PORT 9.1)", async () => {
    const first = makeHarness();
    await first.engine.load();
    const cached = first.cacheStore.value!;
    expect(cached.find((p) => p.blockId === "p1")!.spans).toEqual([
      { text: "Hello world", bold: false, italic: false, strikethrough: false, code: false },
    ]);
    const second = makeHarness();
    second.cacheStore.value = cached;
    const api = second.server.api();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    second.engine.api.blockChildren = async (id) => { await gate; return api.blockChildren(id); };
    const pending = second.engine.load();
    await new Promise((r) => setTimeout(r, 0));
    expect(second.host.text()).toContain("Hello world"); // painted from the cache
    expect(second.engine.hasLoaded).toBe(false);
    release();
    await pending;
    expect(second.engine.hasLoaded).toBe(true);
  });

  it("concurrent load() calls share one fetch", async () => {
    const { server, engine } = makeHarness();
    await Promise.all([engine.load(), engine.load()]);
    expect(server.log.filter((r) => r.path === "/v1/blocks/page-1/children")).toHaveLength(1);
  });

  it("editing is ignored until loaded: a local edit before hasLoaded schedules nothing", async () => {
    const { server, host, engine } = makeHarness({ seed: false });
    host.insertParagraph(-1, { text: "x" });
    expect(engine.status.t).toBe("saved");
    await engine.syncNow();
    expect(server.log).toEqual([]);
  });

  it("flush() syncs a pending edit right away", async () => {
    const { server, host, engine } = makeHarness();
    await engine.load();
    server.clearLog();
    host.type(1, 11, "!");
    await engine.flush();
    expect(server.writes.map((w) => w.description)).toEqual(["PATCH /v1/blocks/p1"]);
    expect(engine.hasUnsyncedChanges).toBe(false);
  });

  it("statuses: Saved, Saving…, offline text, errors pass through", async () => {
    const { statusLabel } = await import("./engine");
    expect(statusLabel({ t: "saved" })).toBe("Saved");
    expect(statusLabel({ t: "saving" })).toBe("Saving…");
    expect(statusLabel({ t: "offline", message: "x" })).toBe("Offline, will retry");
    expect(statusLabel({ t: "error", message: "Not saved: boom" })).toBe("Not saved: boom");
    expect(K.paragraph.t).toBe("paragraph");
  });
});
