import type { DataSourceSchema } from "../../domain/notion/dataSourceSchema";
import type { JsonValue } from "../../domain/notion/json";
import type { Operation } from "../../domain/notion/pendingWrite";
import type { Row } from "../../domain/notion/row";
import type { QueueOutcome } from "../../ipc/types";

/** Injected so the model can be tested with fakes (plan 2.4). */
export interface NotionPort {
  /** Data source ids of a database container (child_database block id). */
  retrieveDatabase(databaseId: string): Promise<{ id: string; name: string }[]>;
  retrieveDataSource(id: string): Promise<DataSourceSchema>;
  queryDataSource(id: string, filter: JsonValue | null, sorts: JsonValue | null): Promise<Row[]>;
}

export interface QueuePort {
  submit(op: Operation): Promise<QueueOutcome>;
}

export interface CachePort {
  loadRows(key: string): Promise<Row[] | null>;
  saveRows(key: string, rows: Row[]): Promise<void>;
}

export interface DatabasePorts {
  notion: NotionPort;
  queue: QueuePort;
  cache: CachePort;
}

/** Mirrors `NotionError.notFound` for the "share it with your integration" message. */
export function isNotFound(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { kind?: unknown }).kind === "notFound";
}

export function errorText(e: unknown): string {
  if (typeof e === "object" && e !== null && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return String(e);
}
