import { afterEach, describe, expect, it, vi } from "vitest";
import { K } from "../markdown/paragraphKind";
import { at, makeHarness, seedPage } from "./engineHarness";
import { statusLabel } from "./engine";

afterEach(() => { vi.useRealTimers(); });

describe("PageEditorEngine: saving against a fake Notion", () => {
  it("editsAreSaved: load keeps empty lines; edits produce exactly the right PATCH/DELETE requests; server matches", async () => {
    const { server, host, engine } = makeHarness();
    await engine.load();
    expect(host.text()).toBe("Title\nHello world\n\nBuy milk\n\uFFFC\nParent\nChild\nLast\n");
    expect(host.blockIds()).toEqual(["h", "p1", "e1", "t1", "db", "b1", "c1", "p5", "e2"]);
    server.clearLog();

    host.type(1, 5, " brave");
    host.split(1, 17);
    host.type(2, 0, "New line");
    host.toggleCheckbox(4);
    host.removeParagraph(8);
    expect(engine.status.t).toBe("saving");

    await engine.syncNow();
    const writes = server.writes;
    expect(writes.map((w) => w.description)).toEqual([
      "PATCH /v1/blocks/p1", "PATCH /v1/blocks/page-1/children", "PATCH /v1/blocks/t1", "DELETE /v1/blocks/p5",
    ]);
    expect(at(writes[0]!.body, "paragraph", "rich_text", 0, "text", "content")).toBe("Hello brave world");
    expect(at(writes[1]!.body, "position", "type")).toBe("after_block");
    expect(at(writes[1]!.body, "position", "after_block", "id")).toBe("p1");
    expect(at(writes[1]!.body, "children", 0, "type")).toBe("paragraph");
    expect(at(writes[1]!.body, "children", 0, "paragraph", "rich_text", 0, "text", "content")).toBe("New line");
    expect(at(writes[2]!.body, "to_do", "checked")).toBe(true);
    expect(at(writes[2]!.body, "to_do", "rich_text", 0, "text", "content")).toBe("Buy milk");

    expect(engine.status.t).toBe("saved");
    expect(host.blockIds()).toEqual(["h", "p1", "new-1", "e1", "t1", "db", "b1", "c1", "e2"]);
    expect(server.childIds("page-1")).toEqual(["h", "p1", "new-1", "e1", "t1", "db", "b1", "e2"]);
    expect(await engine.fetchDocument()).toEqual(engine.previous);

    server.clearLog();
    await engine.syncNow();
    expect(server.writes).toEqual([]);

    // The inserted block is now tracked by id: typing in it updates it in place.
    host.type(2, 8, "!");
    await engine.syncNow();
    expect(server.writes.map((w) => w.description)).toEqual(["PATCH /v1/blocks/new-1"]);
    expect(server.plainText("new-1")).toBe("New line!");
  });

  it("emptyLinesAreSaved: new empty lines are saved as empty blocks and survive a remote refresh", async () => {
    const { server, host, engine } = makeHarness();
    await engine.load();
    server.clearLog();
    host.insertParagraph(0, {});
    host.insertParagraph(1, {});
    await engine.syncNow();
    const writes = server.writes;
    expect(writes.map((w) => w.description)).toEqual(["PATCH /v1/blocks/page-1/children"]);
    expect((at(writes[0]!.body, "children") as unknown[]).length).toBe(2);
    expect(at(writes[0]!.body, "children", 0, "paragraph", "rich_text")).toEqual([]);
    expect(at(writes[0]!.body, "position", "after_block", "id")).toBe("h");

    server.remoteEdit("p1", "Hello from Notion");
    await engine.refreshFromServer();
    expect(host.text()).toBe("Title\n\n\nHello from Notion\n\nBuy milk\n\uFFFC\nParent\nChild\nLast\n");
    expect(host.blockIds()).toEqual(["h", "new-1", "new-2", "p1", "e1", "t1", "db", "b1", "c1", "p5", "e2"]);
  });

  it("nesting: nested insert goes under its parent; indenting a line recreates it under the parent", async () => {
    const { server, host, engine } = makeHarness();
    await engine.load();
    server.clearLog();
    host.split(6, 5, K.bulleted); // Enter after "Child" continues the nested bullet
    host.type(7, 0, "Child 2");
    await engine.syncNow();
    expect(server.writes.map((w) => w.description)).toEqual(["PATCH /v1/blocks/b1/children"]);
    expect(at(server.writes[0]!.body, "position", "after_block", "id")).toBe("c1");
    expect(server.childIds("b1")).toEqual(["c1", "new-1"]);

    server.clearLog();
    host.setDepth(8, 1); // Tab at the start of "Last"
    await engine.syncNow();
    expect(server.writes.map((w) => w.description)).toEqual(["PATCH /v1/blocks/b1/children", "DELETE /v1/blocks/p5"]);
    expect(at(server.writes[0]!.body, "position", "after_block", "id")).toBe("new-1");
    expect(server.childIds("b1")).toEqual(["c1", "new-1", "new-2"]);
    expect(await engine.fetchDocument()).toEqual(engine.previous);
  });

  it("debounce: nothing at 0.3 s, PATCH by 1.8 s", async () => {
    vi.useFakeTimers();
    const { server, host, engine } = makeHarness();
    await engine.load();
    server.clearLog();
    host.type(1, 11, "!");
    await vi.advanceTimersByTimeAsync(300);
    expect(server.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(server.writes.map((w) => w.description)).toEqual(["PATCH /v1/blocks/p1"]);
    expect(engine.status.t).toBe("saved");
  });

  it("transientFailure: a network failure is surfaced (offline), not swallowed, and the next sync retries it", async () => {
    const { server, host, engine } = makeHarness();
    await engine.load();
    server.clearLog();
    host.type(1, 11, "?");
    server.failNextWrites(1);
    await engine.syncNow();
    expect(engine.status.t).toBe("offline");
    expect(statusLabel(engine.status)).toBe("Offline, will retry");
    expect(engine.previous.find((p) => p.blockId === "p1")?.content).toBe("Hello world");
    expect(engine.hasUnsyncedChanges).toBe(true);

    await engine.syncNow();
    expect(server.writes.map((w) => w.description)).toEqual(["PATCH /v1/blocks/p1"]);
    expect(server.plainText("p1")).toBe("Hello world?");
    expect(engine.status.t).toBe("saved");
  });

  it("tokenIsRestored: deleting a token chip line never deletes the block; the chip is restored", async () => {
    const { server, host, engine } = makeHarness();
    await engine.load();
    server.clearLog();
    host.removeParagraph(4);
    await engine.syncNow();
    expect(server.writes).toEqual([]);
    expect(host.blockIds()).toEqual(["h", "p1", "e1", "t1", "db", "b1", "c1", "p5", "e2"]);
    expect(engine.restoredTokenHint).not.toBeNull();
  });

  it("massDelete: select-all + delete is held back until confirmed", async () => {
    const { server, host, engine } = makeHarness();
    await engine.load();
    server.clearLog();
    for (let i = 8; i > 4; i--) host.removeParagraph(i); // keep the chip: tokens are never deleted
    for (let i = 3; i >= 0; i--) host.removeParagraph(i);
    await engine.syncNow();
    expect(server.writes).toEqual([]);
    expect(engine.pendingMassDelete).toBeGreaterThanOrEqual(3);
    expect(engine.status).toEqual({ t: "error", message: `Not saved: this would delete ${engine.pendingMassDelete} blocks.` });

    await engine.confirmMassDelete();
    expect(server.writes.some((w) => w.method === "DELETE")).toBe(true);
    expect(server.childIds("page-1")).toEqual(["db"]);
    expect(engine.pendingMassDelete).toBeNull();
  });

  it("toggleAndCallout: toggle with 2 children and a callout edit are saved with the right shapes; cover is read", async () => {
    const { server, host, engine } = makeHarness({ seed: false });
    seedPage(server);
    server.seed("page-1", [{ id: "k", type: "callout", text: "Heads up", extra: { icon: { type: "external", external: { url: "https://x.example/i.png" } } } }]);
    server.seedPage("page-1", { object: "page", id: "page-1", cover: { type: "external", external: { url: "https://img.example/cover.jpg" } } });
    await engine.load();
    expect(engine.cover?.url).toBe("https://img.example/cover.jpg");
    expect(host.kinds()[host.kinds().length - 1]).toEqual(K.callout(""));
    server.clearLog();

    host.type(9, 8, "!"); // the callout's text (its external icon must not be touched)
    host.insertParagraph(0, { text: "Details", kind: K.toggle });
    host.insertParagraph(1, { text: "one", depth: 1 });
    host.insertParagraph(2, { text: "two", kind: K.bulleted, depth: 1 });
    await engine.syncNow();

    const writes = server.writes;
    expect(writes.map((w) => w.description)).toEqual([
      "PATCH /v1/blocks/page-1/children", "PATCH /v1/blocks/new-1/children", "PATCH /v1/blocks/k",
    ]);
    expect(at(writes[0]!.body, "children", 0, "type")).toBe("toggle");
    expect(at(writes[0]!.body, "children", 0, "toggle", "rich_text", 0, "text", "content")).toBe("Details");
    expect(at(writes[0]!.body, "position", "after_block", "id")).toBe("h");
    expect((at(writes[1]!.body, "children") as unknown[]).length).toBe(2);
    expect(at(writes[1]!.body, "position", "type")).toBe("start");
    expect(at(writes[2]!.body, "callout", "rich_text", 0, "text", "content")).toBe("Heads up!");
    expect(at(writes[2]!.body, "callout", "icon")).toBeUndefined();
    expect(server.childIds("new-1")).toEqual(["new-2", "new-3"]);
    expect(await engine.fetchDocument()).toEqual(engine.previous);
  });

  it("typedTodoIsSaved: a to-do typed via \"[] \" is saved as to_do, with no prefix in its rich text", async () => {
    const { server, host, engine } = makeHarness();
    await engine.load();
    server.clearLog();
    host.insertParagraph(1, { text: "Call **mom**", kind: K.toDo(false) });
    expect(host.paragraphs()[2]!.kind).toEqual(K.toDo(false));
    await engine.syncNow();
    const writes = server.writes;
    expect(writes.map((w) => w.description)).toEqual(["PATCH /v1/blocks/page-1/children"]);
    expect(at(writes[0]!.body, "children", 0, "type")).toBe("to_do");
    expect(at(writes[0]!.body, "children", 0, "to_do", "checked")).toBe(false);
    expect(at(writes[0]!.body, "children", 0, "to_do", "rich_text", 0, "text", "content")).toBe("Call ");
    expect(at(writes[0]!.body, "children", 0, "to_do", "rich_text", 1, "text", "content")).toBe("mom");
    expect(at(writes[0]!.body, "children", 0, "to_do", "rich_text", 1, "annotations", "bold")).toBe(true);
    expect(server.plainText("new-1")).toBe("Call mom");
    expect(await engine.fetchDocument()).toEqual(engine.previous);
  });
});
