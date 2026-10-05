import type { EngineApi, EngineCache } from "../domain/editor/ports";
import type { SyncedParagraph } from "../domain/editor/types";
import { decodeBlock } from "../domain/notion/block";
import type { JsonValue } from "../domain/notion/json";
import {
  cacheLoad, cacheSave, notionAppendBlocks, notionBlockChildren, notionRetrieveBlock, notionRetrievePage, queueSubmit, uploadImage,
} from "../ipc/commands";

/** The real engine ports over the Tauri commands. */
export const ipcEngineApi: EngineApi = {
  blockChildren: notionBlockChildren,
  retrievePage: notionRetrievePage,
  retrieveBlock: async (id) => decodeBlock(await notionRetrieveBlock(id)),
  appendBlocks: notionAppendBlocks,
  queueSubmit: (op, retain) => queueSubmit(op, retain),
  uploadFile: (data, filename, contentType) => uploadImage({ bytes: Array.from(data) }, filename, contentType),
};

export const ipcEngineCache = (pinId: string): EngineCache => ({
  async load() {
    const json = await cacheLoad(pinId, "editor-doc");
    return Array.isArray(json) ? (json as unknown as SyncedParagraph[]) : null;
  },
  async save(previous) {
    await cacheSave(pinId, "editor-doc", previous as unknown as JsonValue);
  },
});
