import { afterEach, describe, expect, it, vi } from "vitest";
import { PageEditorEngine } from "./engine";
import { engineConfig } from "./engineConfig";
import { makeHarness } from "./engineHarness";
import { TestEditorHost } from "../../test/editorHost";
import { FakeNotionServer } from "../../test/fakeNotion";
import { seedPage } from "./engineHarness";

afterEach(() => { vi.useRealTimers(); });

/** An engine with the real default timings (no overrides). */
function defaults() {
  const server = new FakeNotionServer();
  seedPage(server);
  const host = new TestEditorHost();
  const engine = new PageEditorEngine({ pageId: "page-1", api: server.api(), doc: host });
  return { server, host, engine };
}

describe("engineConfig constants", () => {
  it("values", () => {
    expect(engineConfig.debounceMs).toBe(700);
    expect(engineConfig.pollIntervalMs).toBe(45_000);
    expect(engineConfig.remoteQuietPeriodMs).toBe(5_000);
    expect(engineConfig.retryIntervalMs).toBe(15_000);
    expect(engineConfig.maxPasses).toBe(5);
    expect(engineConfig.restoredHintMs).toBe(4_000);
    expect(engineConfig.flushOnQuitMs).toBe(3_000);
  });

  it("debounce 700 ms: nothing at 699, saved at 700", async () => {
    vi.useFakeTimers();
    const { server, host, engine } = defaults();
    await engine.load();
    server.clearLog();
    host.type(1, 11, "!");
    await vi.advanceTimersByTimeAsync(699);
    expect(server.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.writes.map((w) => w.description)).toEqual(["PATCH /v1/blocks/p1"]);
  });

  it("retry 15 s after a transient failure", async () => {
    vi.useFakeTimers();
    const { server, host, engine } = defaults();
    await engine.load();
    server.clearLog();
    host.type(1, 11, "?");
    server.failNextWrites(1);
    await vi.advanceTimersByTimeAsync(700);
    expect(engine.status.t).toBe("offline");
    await vi.advanceTimersByTimeAsync(14_999);
    expect(server.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.writes.map((w) => w.description)).toEqual(["PATCH /v1/blocks/p1"]);
    expect(engine.status.t).toBe("saved");
  });

  it("poll every 45 s applies a remote change once the editor is idle", async () => {
    vi.useFakeTimers();
    const { server, host, engine } = defaults();
    await engine.load();
    engine.startPolling();
    server.remoteEdit("p1", "From Notion");
    await vi.advanceTimersByTimeAsync(44_999);
    expect(host.text()).toContain("Hello world");
    await vi.advanceTimersByTimeAsync(1);
    expect(host.text()).toContain("From Notion");
    engine.dispose();
  });

  it("remote quiet period 5 s since the last local edit", async () => {
    vi.useFakeTimers();
    const { server, host, engine } = defaults();
    await engine.load();
    host.type(5, 6, "!"); // edit "Parent"
    await vi.advanceTimersByTimeAsync(700); // synced
    server.remoteEdit("p1", "From Notion");
    await vi.advanceTimersByTimeAsync(3_000);
    await engine.refreshFromServer();
    expect(host.text()).toContain("Hello world"); // 3 s after the edit: skipped
    await vi.advanceTimersByTimeAsync(2_000);
    await engine.refreshFromServer();
    expect(host.text()).toContain("From Notion");
  });

  it("restored-token hint shows for 4 s", async () => {
    vi.useFakeTimers();
    const { host, engine } = defaults();
    await engine.load();
    host.removeParagraph(4);
    await engine.syncNow();
    expect(engine.restoredTokenHint).toBe("Restored a block that can't be deleted here. Delete it in Notion.");
    await vi.advanceTimersByTimeAsync(3_999);
    expect(engine.restoredTokenHint).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(engine.restoredTokenHint).toBeNull();
  });

  it("passes per syncNow stay bounded by maxPasses", async () => {
    const { host, engine } = makeHarness();
    await engine.load();
    // A document that never settles: every pass re-inserts because the id is cleared again.
    let passes = 0;
    const real = engine.api.queueSubmit;
    engine.api.queueSubmit = async (op, retain) => { passes++; host.type(1, 0, "x"); return real(op, retain); };
    host.type(1, 0, "x");
    await engine.syncNow();
    expect(passes).toBeLessThanOrEqual(engineConfig.maxPasses);
    engine.dispose();
  });
});
