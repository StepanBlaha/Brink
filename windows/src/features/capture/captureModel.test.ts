import { describe, expect, it } from "vitest";
import type { Operation } from "../../domain/notion/pendingWrite";
import type { Pin } from "../../domain/store/pin";
import type { QueueOutcome } from "../../ipc/types";
import { sprintSchema } from "../database/fakePorts";
import { CaptureModel, type CapturePorts } from "./captureModel";

const page: Pin = { id: "p1", notionId: "page-1", kind: "page", title: "Inbox", icon: { none: {} }, order: 0 };
const db: Pin = { id: "p2", notionId: "ds-1", kind: "dataSource", title: "Buylist", icon: { none: {} }, order: 1 };
const dbDated: Pin = { ...db, config: { doneProperty: "Done", doneKind: "checkbox", dateProperty: "Due", showDone: false } };

function make(pins: Pin[], last?: string, outcome: QueueOutcome = { kind: "saved" }) {
  const ops: Operation[] = [];
  const state = { last, fetches: 0 };
  const ports: CapturePorts = {
    pins: () => pins,
    lastPinId: () => state.last,
    setLastPinId: (id) => { state.last = id; },
    submit: async (op) => { ops.push(op); return outcome; },
    retrieveDataSource: async () => { state.fetches++; return sprintSchema; },
    now: () => new Date(2026, 8, 29, 10, 0),
  };
  return { model: new CaptureModel(ports), ops, state };
}

describe("CaptureModel", () => {
  it("restores the remembered pin, else falls back to the first", () => {
    expect(make([page, db], "p2").model.destinationId).toBe("p2");
    expect(make([page, db], "gone").model.destinationId).toBe("p1");
    expect(make([]).model.destinationId).toBeUndefined();
  });

  it("remembers the destination in quickCaptureLastPinID", () => {
    const { model, state } = make([page, db]);
    model.setDestination("p2");
    expect(state.last).toBe("p2");
  });

  it("resolves the date property from the schema once and previews the date", async () => {
    const { model, state } = make([db], "p2");
    expect(model.datePreview).toBeNull();
    await model.resolveDateProperty();
    await model.resolveDateProperty();
    expect(state.fetches).toBe(1);
    model.setText("Milk tomorrow");
    expect(model.dateProperty).toBe("Due");
    expect(model.datePreview?.cleanTitle).toBe("Milk");
  });

  it("saves with the toast message and clears the text", async () => {
    const { model, ops } = make([dbDated], "p2");
    model.setText("Milk tomorrow 5pm");
    const r = await model.save();
    expect(r).toEqual({ kind: "saved", message: "Added to Buylist ✓", pinId: "p2" });
    expect(ops[0]).toMatchObject({ kind: "createRow", title: "Milk" });
    expect(model.text).toBe("");
  });

  it("queued shows the offline toast; failed keeps the text and the message", async () => {
    const queued = make([page], undefined, { kind: "queued", message: "offline" });
    queued.model.setText("call mom");
    expect(await queued.model.save()).toEqual({ kind: "saved", message: "Saved offline, will sync" });
    const failed = make([page], undefined, { kind: "failed", message: "No access" });
    failed.model.setText("call mom");
    expect(await failed.model.save()).toEqual({ kind: "failed" });
    expect(failed.model.errorMessage).toBe("No access");
    expect(failed.model.text).toBe("call mom");
  });

  it("no pins gives the pin-first message; empty text gives no write", async () => {
    const none = make([]);
    none.model.setText("x");
    await none.model.save();
    expect(none.model.errorMessage).toBe("Pin a page or database first.");
    const { model, ops } = make([page]);
    model.setText("  ");
    expect(await model.save()).toEqual({ kind: "failed" });
    expect(ops).toHaveLength(0);
  });
});
