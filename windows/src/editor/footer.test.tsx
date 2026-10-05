// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageEditorEngine } from "../domain/editor/engine";
import { FakeNotionServer } from "../test/fakeNotion";
import { EditorFooter, footerModel } from "./EditorFooter";
import { createBrinkDoc } from "./setup";

afterEach(cleanup);

async function loaded() {
  const server = new FakeNotionServer();
  server.seed("page-1", ["a", "b", "c", "d", "e"].map((id) => ({ id, type: "paragraph", text: id.toUpperCase() })));
  server.seed("b", [{ id: "b1", type: "paragraph", text: "B1" }, { id: "b2", type: "paragraph", text: "B2" }]);
  const doc = createBrinkDoc();
  const engine = new PageEditorEngine({ pageId: "page-1", api: server.api(), doc, debounceMs: 700, remoteQuietPeriodMs: 0, retryIntervalMs: 600_000 });
  await engine.load();
  return { server, doc, engine };
}

describe("editor footer and the mass-delete guard", () => {
  it("shows Saved, then the guard message and button counting nested children; confirming sends the DELETEs", async () => {
    const { server, doc, engine } = await loaded();
    render(<EditorFooter engine={engine} />);
    expect(screen.getByRole("status").textContent).toContain("Saved");
    const ids = doc.paragraphs().map((p) => p.blockId);
    expect(ids).toEqual(["a", "b", "b1", "b2", "c", "d", "e"]);
    // delete a, b (with its two children) and c: 5 blocks of 7
    const size = (i: number) => doc.state.doc.child(i).nodeSize;
    let end = 0;
    for (let i = 0; i < 5; i++) end += size(i);
    doc.dispatch(doc.state.tr.delete(0, end));
    server.clearLog();
    await act(async () => { await engine.syncNow(); });
    expect(server.writes).toEqual([]);
    expect(screen.getByRole("status").textContent).toContain("Not saved: this would delete 5 blocks.");
    const button = screen.getByRole("button", { name: "Delete 5 blocks in Notion" });
    await act(async () => { fireEvent.click(button); });
    expect(server.writes.filter((w) => w.description.startsWith("DELETE")).map((w) => w.description).sort()).toEqual([
      "DELETE /v1/blocks/a", "DELETE /v1/blocks/b", "DELETE /v1/blocks/c",
    ]);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Saved");
  });

  it("status copy: Saving…, Offline, will retry, errors; no em dashes", () => {
    const base = { restoredTokenHint: null, errorMessage: null, isDocumentEmpty: false, hasLoaded: true, pendingMassDelete: null };
    expect(footerModel({ ...base, status: { t: "saving" } })).toMatchObject({ text: "Saving…", tone: "normal" });
    expect(footerModel({ ...base, status: { t: "offline", message: "x" } })).toMatchObject({ text: "Offline, will retry", tone: "dim" });
    expect(footerModel({ ...base, status: { t: "error", message: "Not saved: boom" } })).toMatchObject({ text: "Not saved: boom", tone: "danger" });
    expect(footerModel({ ...base, status: { t: "saved" }, restoredTokenHint: "Kept it." }).text).toBe("Kept it.");
    for (const s of ["saving", "saved"] as const) expect(footerModel({ ...base, status: { t: s } }).text).not.toContain(String.fromCharCode(0x2014));
  });
});
