import { cacheLoad, cacheSave, notionQueryDataSource, notionRetrieveDatabase, notionRetrieveDataSource, queueSubmit } from "../../ipc/commands";
import { decodeRows, encodeRow } from "../../domain/notion/row";
import { isObject } from "../../domain/notion/json";
import type { DatabasePorts } from "./ports";

/** Real ports over the Tauri commands. */
export const ipcPorts: DatabasePorts = {
  notion: {
    async retrieveDatabase(id) {
      const list = await notionRetrieveDatabase(id);
      const out: { id: string; name: string }[] = [];
      if (Array.isArray(list)) {
        for (const d of list) if (isObject(d)) out.push({ id: String(d["id"] ?? ""), name: String(d["name"] ?? "") });
      }
      return out;
    },
    retrieveDataSource: notionRetrieveDataSource,
    queryDataSource: notionQueryDataSource,
  },
  queue: { submit: (op) => queueSubmit(op) },
  cache: {
    async loadRows(key) {
      const json = await cacheLoad(key, "rows");
      return json === null ? null : decodeRows(json);
    },
    async saveRows(key, rows) {
      await cacheSave(key, "rows", rows.map(encodeRow));
    },
  },
};
