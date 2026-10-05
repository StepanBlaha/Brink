import { describe, expect, it, vi } from "vitest";
import type { ClipboardContent } from "../../domain/capture/clipboardMapper";
import type { Operation } from "../../domain/notion/pendingWrite";
import type { Pin } from "../../domain/store/pin";
import type { QueueOutcome } from "../../ipc/types";
import { clipboardAppend } from "./clipboardAppend";

const page: Pin = { id: "p1", notionId: "page-1", kind: "page", title: "Inbox", icon: { none: {} }, order: 0 };
const db: Pin = { id: "p2", notionId: "ds", kind: "dataSource", title: "Tasks", icon: { none: {} }, order: 1 };

function run(o: { last?: string | undefined; clip?: ClipboardContent; out?: QueueOutcome; pins?: Pin[] }) {
  const toasts: [string, boolean][] = [];
  const ops: Operation[] = [];
  const read = vi.fn(async () => o.clip ?? ({ kind: "text", text: "hello" } as ClipboardContent));
  const done = clipboardAppend({
    pins: () => o.pins ?? [page, db],
    settings: () => (o.last ? { lastOpenedPinID: o.last } : {}),
    readClipboard: read,
    submit: async (op) => { ops.push(op); return o.out ?? { kind: "saved" }; },
    toast: (m, e) => toasts.push([m, e]),
    contentChanged: () => {},
  });
  return { done, toasts, ops, read };
}

describe("clipboard append", () => {
  it("reads the last-opened pin from lastOpenedPinID and appends blocks at the end", async () => {
    const r = run({ last: "p1", clip: { kind: "text", text: "https://example.com" } });
    await r.done;
    expect(r.ops[0]).toMatchObject({ kind: "appendBlocks", parentId: "page-1", position: { end: {} } });
    expect(r.toasts).toEqual([["Pasted into Inbox ✓", false]]);
  });
  it("no last pin, a database pin or a stale id says Open a page pin first (clipboard untouched)", async () => {
    for (const last of [undefined, "p2", "gone"]) {
      const r = run({ last });
      await r.done;
      expect(r.toasts).toEqual([["Open a page pin first", true]]);
      expect(r.read).not.toHaveBeenCalled();
    }
  });
  it("image and empty clipboard", async () => {
    const img = run({ last: "p1", clip: { kind: "image" } });
    await img.done;
    expect(img.toasts).toEqual([["Images not supported yet", true]]);
    const empty = run({ last: "p1", clip: { kind: "empty" } });
    await empty.done;
    expect(empty.toasts).toEqual([["Clipboard is empty", true]]);
    expect(empty.ops).toHaveLength(0);
  });
  it("offline and failed outcomes", async () => {
    const q = run({ last: "p1", out: { kind: "queued", message: "x" } });
    await q.done;
    expect(q.toasts).toEqual([["Saved offline, will sync", false]]);
    const f = run({ last: "p1", out: { kind: "failed", message: "No access" } });
    await f.done;
    expect(f.toasts).toEqual([["No access", true]]);
  });
});
