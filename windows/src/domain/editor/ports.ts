import type { Block } from "../notion/block";
import type { BlockPosition, NewBlock } from "../notion/newBlock";
import type { PageMeta } from "../notion/pageMeta";
import type { Operation } from "../notion/pendingWrite";
import type { QueueOutcome } from "../../ipc/types";
import type { DocParagraph, SyncedParagraph } from "./types";

/** What the engine needs from the Notion client and write queue (Tauri commands in the app). */
export interface EngineApi {
  blockChildren(id: string): Promise<Block[]>;
  retrievePage(id: string): Promise<PageMeta>;
  retrieveBlock(id: string): Promise<Block>;
  appendBlocks(parentId: string, blocks: NewBlock[], position: BlockPosition): Promise<Block[]>;
  /** updateBlock / deleteBlock go through the queue (offline-safe, FIFO). */
  queueSubmit(op: Operation, retainOnTransientFailure: boolean): Promise<QueueOutcome>;
  /** Uploads an image and returns the file upload id. */
  /** Saves the last-known page Markdown before a deleting save (best effort; errors are ignored). */
  backupPage?(pageId: string, markdown: string): Promise<void>;
  uploadFile(data: Uint8Array, filename: string, contentType: string): Promise<string>;
}

export interface EngineCache {
  load(): Promise<SyncedParagraph[] | null>;
  save(previous: SyncedParagraph[]): Promise<void>;
}

export interface TokenInfo {
  blockId: string;
  type: string;
  title: string;
}

/**
 * The engine talks to the document only through this port (PORT 3.c.1). The ProseMirror document
 * (M5b) and the array model in `src/test/editorHost.ts` both implement it.
 */
export interface EditorDocPort {
  paragraphs(): DocParagraph[];
  /** Rebuilds the document from the server state; clears undo history. */
  load(synced: SyncedParagraph[], preserveSelection: boolean): void;
  /** Stamps a confirmed Notion id; attribute-only. False if the paragraph is gone. */
  setBlockId(localId: string, blockId: string): boolean;
  /** Forgets a Notion id (the block is gone) so the paragraph is inserted again. */
  clearBlockId(blockId: string): void;
  restoreToken(token: TokenInfo, depth: number, afterBlockId: string | null): void;
  blockIdForLocal(localId: string): string | null;
  /** Bumped by every local edit (text, kind, depth, ids stamped by the user), not by collapse. */
  readonly editGeneration: number;
  /** Epoch ms of the last local edit. */
  readonly lastLocalEditAt: number | null;
  readonly isEmpty: boolean;
  onLocalEdit: (() => void) | null;
  /** "Uploading image…" placeholder after paragraph index `index`; returns its local id. */
  insertUploadPlaceholder(afterParagraphIndex: number): string;
  /** Turns the placeholder into the uploaded image (`upload:<id>`). False if it is gone. */
  replacePlaceholder(localId: string, uploadId: string): boolean;
  removePlaceholder(localId: string): void;
}
