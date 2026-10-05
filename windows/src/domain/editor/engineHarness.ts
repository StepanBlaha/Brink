import { FakeNotionServer } from "../../test/fakeNotion";
import { TestEditorHost } from "../../test/editorHost";
import { PageEditorEngine } from "./engine";
import type { EngineCache } from "./ports";
import type { SyncedParagraph } from "./types";

/** Shared setup of the engine suites (makeEngine / seedPage of PageEditorEngineTests). */
export interface Harness {
  server: FakeNotionServer;
  host: TestEditorHost;
  engine: PageEditorEngine;
  cacheStore: { value: SyncedParagraph[] | null };
}

export function seedPage(server: FakeNotionServer): void {
  server.reset();
  server.seed("page-1", [
    { id: "h", type: "heading_1", text: "Title" },
    { id: "p1", type: "paragraph", text: "Hello world" },
    { id: "e1", type: "paragraph", text: "" },
    { id: "t1", type: "to_do", text: "Buy milk", extra: { checked: false } },
    { id: "db", type: "child_database", text: null, extra: { title: "Tasks" } },
    { id: "b1", type: "bulleted_list_item", text: "Parent" },
    { id: "p5", type: "paragraph", text: "Last" },
    { id: "e2", type: "paragraph", text: "" },
  ]);
  server.seed("b1", [{ id: "c1", type: "bulleted_list_item", text: "Child" }]);
}

export function makeHarness(o: { debounceMs?: number; seed?: boolean } = {}): Harness {
  const server = new FakeNotionServer();
  if (o.seed !== false) seedPage(server);
  const host = new TestEditorHost();
  const cacheStore: Harness["cacheStore"] = { value: null };
  const cache: EngineCache = {
    load: async () => cacheStore.value,
    save: async (p) => { cacheStore.value = p.map((x) => ({ ...x })); },
  };
  const engine = new PageEditorEngine({
    pageId: "page-1", api: server.api(), doc: host, cache,
    debounceMs: o.debounceMs ?? 700, remoteQuietPeriodMs: 0, retryIntervalMs: 600_000,
  });
  return { server, host, engine, cacheStore };
}

/** Reads `a.b[0].c` from nested JSON. */
export function at(root: unknown, ...path: (string | number)[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}
