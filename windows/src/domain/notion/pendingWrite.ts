import { arr, isObject, req, type JsonObject } from "./json";
import {
  decodeBlockUpdate, decodeNewBlock, decodePosition, encodeBlockUpdate, encodeNewBlock, encodePosition,
  positionEnd, type BlockPosition, type BlockUpdate, type NewBlock,
} from "./newBlock";
import { decodePropertyUpdate, encodePropertyUpdate, type PropertyUpdate } from "./propertyValue";

export type Operation =
  | { kind: "toggleDone"; pageId: string; update: PropertyUpdate }
  | { kind: "createRow"; dataSourceId: string; title: string; extra: PropertyUpdate[] }
  | { kind: "updateProperty"; pageId: string; updates: PropertyUpdate[] }
  | { kind: "updateBlock"; blockId: string; type: string; update: BlockUpdate }
  | { kind: "appendBlock"; parentId: string; block: NewBlock }
  | { kind: "appendBlocks"; parentId: string; blocks: NewBlock[]; position: BlockPosition }
  | { kind: "deleteBlock"; blockId: string };

/** `createdAt` is seconds since 2001-01-01T00:00:00Z (Swift `Date` default encoding). */
export interface PendingWrite {
  id: string;
  operation: Operation;
  createdAt: number;
}

/** Seconds between 1970-01-01 and 2001-01-01. */
export const swiftEpochOffset = 978307200;

export function swiftDateFrom(unixMs: number): number {
  return unixMs / 1000 - swiftEpochOffset;
}

export function unixMsFromSwiftDate(seconds: number): number {
  return (seconds + swiftEpochOffset) * 1000;
}

export function decodeOperation(v: unknown): Operation {
  if (!isObject(v)) throw new Error("Operation must be an object");
  const kind = req(v, "kind");
  switch (kind) {
    case "toggleDone":
      return { kind, pageId: req(v, "pageId"), update: decodePropertyUpdate(v["update"]) };
    case "createRow":
      return {
        kind,
        dataSourceId: req(v, "dataSourceId"),
        title: req(v, "title"),
        extra: arr(v["extra"]).map(decodePropertyUpdate),
      };
    case "updateProperty":
      return { kind, pageId: req(v, "pageId"), updates: arr(v["updates"]).map(decodePropertyUpdate) };
    case "updateBlock":
      return { kind, blockId: req(v, "blockId"), type: req(v, "type"), update: decodeBlockUpdate(v["update"]) };
    case "appendBlock":
      return { kind, parentId: req(v, "parentId"), block: decodeNewBlock(v["block"]) };
    case "appendBlocks":
      return {
        kind,
        parentId: req(v, "parentId"),
        blocks: arr(v["blocks"]).map(decodeNewBlock),
        position: v["position"] === undefined ? positionEnd : decodePosition(v["position"]),
      };
    case "deleteBlock":
      return { kind, blockId: req(v, "blockId") };
    default:
      throw new Error(`Unknown Operation kind ${kind}`);
  }
}

export function encodeOperation(op: Operation): JsonObject {
  switch (op.kind) {
    case "toggleDone":
      return { kind: "toggleDone", pageId: op.pageId, update: encodePropertyUpdate(op.update) };
    case "createRow":
      return {
        kind: "createRow",
        dataSourceId: op.dataSourceId,
        title: op.title,
        extra: op.extra.map(encodePropertyUpdate),
      };
    case "updateProperty":
      return { kind: "updateProperty", pageId: op.pageId, updates: op.updates.map(encodePropertyUpdate) };
    case "updateBlock":
      return { kind: "updateBlock", blockId: op.blockId, type: op.type, update: encodeBlockUpdate(op.update) };
    case "appendBlock":
      return { kind: "appendBlock", parentId: op.parentId, block: encodeNewBlock(op.block) };
    case "appendBlocks":
      return {
        kind: "appendBlocks",
        parentId: op.parentId,
        blocks: op.blocks.map(encodeNewBlock),
        position: encodePosition(op.position),
      };
    case "deleteBlock":
      return { kind: "deleteBlock", blockId: op.blockId };
  }
}

export function decodePendingWrite(v: unknown): PendingWrite {
  if (!isObject(v)) throw new Error("PendingWrite must be an object");
  const createdAt = v["createdAt"];
  if (typeof createdAt !== "number") throw new Error("PendingWrite.createdAt must be a number");
  return { id: req(v, "id"), operation: decodeOperation(v["operation"]), createdAt };
}

export function encodePendingWrite(w: PendingWrite): JsonObject {
  return { id: w.id, operation: encodeOperation(w.operation), createdAt: w.createdAt };
}

/** Corrupt entries are dropped (Swift `try?` decodes the whole file or nothing; this is more forgiving). */
export function decodePendingWrites(v: unknown): PendingWrite[] {
  return arr(v).map(decodePendingWrite);
}
