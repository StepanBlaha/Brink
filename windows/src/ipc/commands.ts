import { invoke } from "@tauri-apps/api/core";
import { decodeBlocks, type Block } from "../domain/notion/block";
import { decodeDataSourceSchema, type DataSourceSchema } from "../domain/notion/dataSourceSchema";
import type { JsonValue } from "../domain/notion/json";
import type { BlockPosition } from "../domain/notion/newBlock";
import { encodePosition, newBlockRequestJSON, type NewBlock } from "../domain/notion/newBlock";
import { decodePageMeta, type PageMeta } from "../domain/notion/pageMeta";
import { encodeOperation, type Operation } from "../domain/notion/pendingWrite";
import { encodePropertyUpdate, propertyRequestJSON, type PropertyUpdate } from "../domain/notion/propertyValue";
import { decodeRows, type Row } from "../domain/notion/row";
import { decodeSearchResults, type SearchResult } from "../domain/notion/searchResult";
import { decodeGroups, decodePins, encodePin, type Pin, type PinGroup } from "../domain/store/pin";
import type {
  AppVersion, AuthStatus, CacheKind, ConnectionTestResult, QueueOutcome, Settings, UploadSource,
} from "./types";
import { withSettingDefaults } from "./types";

/** Typed wrappers. No component calls `invoke` directly. Tauri converts camelCase args to snake_case params. */
export function appVersion(): Promise<AppVersion> {
  return invoke<AppVersion>("app_version");
}

// ---- shell ----

/** Opens the page in the Notion app when its protocol is registered, else in the browser. */
export function openInNotion(notionId: string): Promise<void> {
  return invoke("open_in_notion", { notionId });
}

export function showSettings(): Promise<void> {
  return invoke("show_settings");
}

// ---- auth ----

export function authStatus(): Promise<AuthStatus> {
  return invoke<AuthStatus>("auth_status");
}

export function authSaveToken(token: string): Promise<void> {
  return invoke("auth_save_token", { token });
}

export function authDisconnect(): Promise<void> {
  return invoke("auth_disconnect");
}

export function authTestConnection(): Promise<ConnectionTestResult> {
  return invoke<ConnectionTestResult>("auth_test_connection");
}

export function oauthAvailable(): Promise<boolean> {
  return invoke<boolean>("oauth_available");
}

export function oauthStart(): Promise<void> {
  return invoke("oauth_start");
}

// ---- notion (Rust moves JSON, TS owns the typed models) ----

export async function notionSearch(query: string): Promise<SearchResult[]> {
  return decodeSearchResults(await invoke<unknown>("notion_search", { query }));
}

export function notionRetrieveDatabase(id: string): Promise<JsonValue> {
  return invoke<JsonValue>("notion_retrieve_database", { id });
}

export async function notionRetrieveDataSource(id: string): Promise<DataSourceSchema> {
  return decodeDataSourceSchema(await invoke<unknown>("notion_retrieve_data_source", { id }));
}

export async function notionQueryDataSource(
  id: string,
  filter: JsonValue | null,
  sorts: JsonValue | null,
): Promise<Row[]> {
  return decodeRows(await invoke<unknown>("notion_query_data_source", { id, filter, sorts }));
}

export async function notionCreateRow(dataSourceId: string, title: string, extra: PropertyUpdate[]): Promise<Row[]> {
  return decodeRows(
    await invoke<unknown>("notion_create_row", { dataSourceId, title, extra: extra.map(encodePropertyUpdate) }),
  );
}

export function notionUpdatePageProperties(pageId: string, updates: PropertyUpdate[]): Promise<JsonValue> {
  const properties: Record<string, JsonValue> = {};
  for (const u of updates) {
    const json = propertyRequestJSON(u.value);
    if (json !== null) properties[u.name] = json;
  }
  return invoke<JsonValue>("notion_update_page_properties", { pageId, properties });
}

export function notionSetPageEmojiIcon(pageId: string, emoji: string): Promise<void> {
  return invoke("notion_set_page_emoji_icon", { pageId, emoji });
}

export async function notionRetrievePage(id: string): Promise<PageMeta> {
  return decodePageMeta(await invoke<unknown>("notion_retrieve_page", { id }));
}

export async function notionBlockChildren(id: string): Promise<Block[]> {
  return decodeBlocks(await invoke<unknown>("notion_block_children", { id }));
}

export function notionRetrieveBlock(id: string): Promise<JsonValue> {
  return invoke<JsonValue>("notion_retrieve_block", { id });
}

export function notionUpdateBlock(id: string, payload: JsonValue): Promise<JsonValue> {
  return invoke<JsonValue>("notion_update_block", { id, payload });
}

/** `position` omitted or `{end:{}}` appends at the end (queue-shaped; Rust converts to the API param). */
export async function notionAppendBlocks(parentId: string, children: NewBlock[], position?: BlockPosition): Promise<Block[]> {
  const body = {
    parentId,
    children: children.map(newBlockRequestJSON),
    ...(position ? { position: encodePosition(position) } : {}),
  };
  return decodeBlocks(await invoke<unknown>("notion_append_blocks", body));
}

export function notionDeleteBlock(id: string): Promise<void> {
  return invoke("notion_delete_block", { id });
}

export function notionUploadFile(source: UploadSource, filename: string, contentType: string): Promise<string> {
  return invoke<string>("notion_upload_file", { ...source, filename, contentType });
}

/** Uploads an image and returns the `fileUploadId`. */
export function uploadImage(source: UploadSource, filename: string, contentType: string): Promise<string> {
  return invoke<string>("upload_image", { ...source, filename, contentType });
}

// ---- pins / groups ----

export async function pinsGet(): Promise<Pin[]> {
  return decodePins(await invoke<unknown>("pins_get"));
}

export function pinsAdd(pin: Pin): Promise<void> {
  return invoke("pins_add", { pin: encodePin(pin) });
}

export function pinsRemove(id: string): Promise<void> {
  return invoke("pins_remove", { id });
}

export function pinsUpdate(pin: Pin): Promise<void> {
  return invoke("pins_update", { pin: encodePin(pin) });
}

export function pinsMoveWithinGroup(pinId: string, toIndex: number, groupId?: string): Promise<void> {
  return invoke("pins_move_within_group", { pinId, toIndex, groupId: groupId ?? null });
}

export function pinsMoveAmongAll(pinId: string, toIndex: number): Promise<void> {
  return invoke("pins_move_among_all", { pinId, toIndex });
}

export function pinsSetGroup(pinId: string, groupId?: string): Promise<void> {
  return invoke("pins_set_group", { pinId, groupId: groupId ?? null });
}

export async function groupsGet(): Promise<PinGroup[]> {
  return decodeGroups(await invoke<unknown>("groups_get"));
}

export function groupsAdd(name: string, emoji?: string): Promise<void> {
  return invoke("groups_add", { name, emoji: emoji ?? null });
}

export function groupsRename(id: string, name: string, emoji?: string): Promise<void> {
  return invoke("groups_rename", { id, name, emoji: emoji ?? null });
}

export function groupsDelete(id: string): Promise<void> {
  return invoke("groups_delete", { id });
}

/** `from` are the dragged indices and `to` the destination offset (SwiftUI `IndexSet` move semantics). */
export function groupsMove(from: number[], to: number): Promise<void> {
  return invoke("groups_move", { from, to });
}

// ---- settings ----

export async function settingsGet(): Promise<Settings> {
  return withSettingDefaults(await invoke<Partial<Settings> | null>("settings_get"));
}

export async function settingsSet(partial: Partial<Settings>): Promise<Settings> {
  return withSettingDefaults(await invoke<Partial<Settings> | null>("settings_set", { partial }));
}

// ---- panel sizes ----

export function panelSizeGet(pinId: string, maxW: number, maxH: number): Promise<[number, number] | null> {
  return invoke<[number, number] | null>("panel_size_get", { pinId, maxW, maxH });
}

export function panelSizeSet(pinId: string, w: number, h: number, maxW: number, maxH: number): Promise<[number, number]> {
  return invoke<[number, number]>("panel_size_set", { pinId, w, h, maxW, maxH });
}

export function panelSizeReset(pinId: string): Promise<void> {
  return invoke("panel_size_reset", { pinId });
}

// ---- cache ----

export function cacheLoad(pinId: string, kind: CacheKind): Promise<JsonValue | null> {
  return invoke<JsonValue | null>("cache_load", { pinId, kind });
}

export function cacheSave(pinId: string, kind: CacheKind, json: JsonValue): Promise<void> {
  return invoke("cache_save", { pinId, kind, json });
}

/** Pre-delete page backup (`<data>/backups/<pageId>-<timestamp>.md`, newest 20 per page). */
export function pageBackup(pageId: string, markdown: string): Promise<void> {
  return invoke("page_backup", { pageId, markdown });
}

export function cacheClear(pinId: string, kind: CacheKind): Promise<void> {
  return invoke("cache_clear", { pinId, kind });
}

/** Local path of the cached cover image. */
export function coverGet(url: string, pageId: string): Promise<string> {
  return invoke<string>("cover_get", { url, pageId });
}

// ---- write queue ----

export function queueSubmit(op: Operation, retainOnTransientFailure = true): Promise<QueueOutcome> {
  return invoke<QueueOutcome>("queue_submit", { op: encodeOperation(op), retainOnTransientFailure });
}

export function queueProcess(): Promise<void> {
  return invoke("queue_process");
}

export function queuePendingCount(): Promise<number> {
  return invoke<number>("queue_pending_count");
}
