import type { Block } from "../notion/block";
import type { FileRef } from "../notion/pageMeta";
import { positionAfter, positionStart, type BlockPosition } from "../notion/newBlock";
import { canHaveChildren, isImage, isToken } from "../markdown/paragraphKind";
import { spansFromContent } from "../markdown/spanRuns";
import { blockUpdate, kindOfBlock, spansOfBlock } from "./blockConvert";
import { engineConfig, type EngineTimings } from "./engineConfig";
import { DecodingError, humanMessage, isGone, isTransient, rawMessage } from "./engineErrors";
import { comparable, freshImageUrl, insertImage, prepareBlocks } from "./engineImages";
import type { EditorDocPort, EngineApi, EngineCache } from "./ports";
import { plan } from "./syncPlanner";
import { syncedParagraph, withContent, type DocParagraph, type EditorSyncOp, type SyncedParagraph } from "./types";
import { apiType } from "../markdown/paragraphKind";
import { maxDepth } from "../markdown/paragraphSyntax";
import type { RichTextSpan } from "../notion/richText";

export type EditorSyncStatus =
  | { t: "saved" }
  | { t: "saving" }
  | { t: "offline"; message: string }
  | { t: "error"; message: string };

export function statusLabel(s: EditorSyncStatus): string {
  switch (s.t) {
    case "saved": return "Saved";
    case "saving": return "Saving…";
    case "offline": return "Offline, will retry";
    case "error": return s.message;
  }
}

export interface EngineOptions extends Partial<EngineTimings> {
  pageId: string;
  api: EngineApi;
  doc: EditorDocPort;
  cache?: EngineCache;
  log?: (level: "info" | "error" | "debug", message: string) => void;
}

type Timer = ReturnType<typeof setTimeout>;

/**
 * Loads a page into the document (one paragraph per block) and keeps Notion in sync by exact
 * block identity (port of PageEditorEngine): local edit, 0.7 s debounce, `syncNow`, plan, ops
 * run sequentially. `previous` only moves on confirmed results.
 */
export class PageEditorEngine {
  readonly pageId: string;
  readonly doc: EditorDocPort;
  status: EditorSyncStatus = { t: "saved" };
  isLoading = false;
  hasLoaded = false;
  errorMessage: string | null = null;
  pendingMassDelete: number | null = null;
  restoredTokenHint: string | null = null;
  isDocumentEmpty = true;
  cover: FileRef | null = null;
  isSyncing = false;
  previous: SyncedParagraph[] = [];
  onImageUploaded: ((id: string, data: Uint8Array) => void) | null = null;
  imageDataProvider: ((url: string) => Promise<Uint8Array | null>) | null = null;

  readonly api: EngineApi;
  private readonly cache: EngineCache | undefined;
  private readonly t: EngineTimings;
  private readonly logFn: (level: "info" | "error" | "debug", message: string) => void;
  private debounceTimer: Timer | null = null;
  private retryTimer: Timer | null = null;
  private pollTimer: Timer | null = null;
  private hintTimer: Timer | null = null;
  private loadPromise: Promise<void> | null = null;
  private syncAgain = false;
  private syncedGeneration = 0;
  private lastPassFailed = false;
  private massDeleteConfirmed = false;
  private listeners = new Set<() => void>();

  constructor(o: EngineOptions) {
    this.pageId = o.pageId;
    this.api = o.api;
    this.doc = o.doc;
    this.cache = o.cache;
    this.t = {
      debounceMs: o.debounceMs ?? engineConfig.debounceMs,
      pollIntervalMs: o.pollIntervalMs ?? engineConfig.pollIntervalMs,
      remoteQuietPeriodMs: o.remoteQuietPeriodMs ?? engineConfig.remoteQuietPeriodMs,
      retryIntervalMs: o.retryIntervalMs ?? engineConfig.retryIntervalMs,
    };
    this.logFn = o.log ?? (() => {});
    this.doc.onLocalEdit = () => this.noteLocalEdit();
  }

  /** Subscribes to state changes (status, hint, cover, ...). Returns the unsubscribe. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }
  protected log(level: "info" | "error" | "debug", message: string): void {
    this.logFn(level, message);
  }
  private setStatus(s: EditorSyncStatus): void {
    this.status = s;
    this.emit();
  }

  /** Anything typed that is not confirmed by Notion yet (or a sync still running). */
  get hasUnsyncedChanges(): boolean {
    return this.debounceTimer !== null || this.isSyncing || this.lastPassFailed || this.doc.editGeneration !== this.syncedGeneration;
  }

  // ---- loading ----

  /** Idempotent: first call loads (cache paint, then server); concurrent calls share it; later calls refresh. */
  async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    if (this.hasLoaded) return this.refreshFromServer();
    this.loadPromise = this.performInitialLoad().finally(() => { this.loadPromise = null; });
    return this.loadPromise;
  }

  private async performInitialLoad(): Promise<void> {
    if (this.previous.length === 0 && this.cache) {
      const cached = await this.cache.load().catch(() => null);
      if (cached && cached.length > 0) {
        this.doc.load(cached, false);
        this.markRebuilt();
      }
    }
    this.isLoading = true;
    this.emit();
    try {
      const fetched = await this.fetchDocument();
      this.previous = fetched;
      this.doc.load(fetched, true);
      this.markRebuilt();
      await this.saveCache();
      this.hasLoaded = true;
      this.errorMessage = null;
      await this.refreshPageMeta();
      this.log("info", `loaded page ${this.pageId}: ${fetched.length} blocks`);
    } catch (e) {
      this.errorMessage = humanMessage(e);
      this.log("error", `load failed for page ${this.pageId}: ${rawMessage(e)}`);
    } finally {
      this.isLoading = false;
      this.emit();
    }
  }

  private markRebuilt(): void {
    this.syncedGeneration = this.doc.editGeneration;
    this.updateEmpty();
  }

  /** Pre-order block list; errors propagate (a partial fetch must never become `previous`). */
  async fetchDocument(): Promise<SyncedParagraph[]> {
    const out: SyncedParagraph[] = [];
    await this.appendChildren(this.pageId, null, 0, out);
    return out;
  }

  private async appendChildren(id: string, parentId: string | null, depth: number, out: SyncedParagraph[]): Promise<void> {
    const blocks: Block[] = await this.api.blockChildren(id);
    for (const block of blocks) {
      const kind = kindOfBlock(block);
      const expand = block.hasChildren && canHaveChildren(kind) && depth < maxDepth;
      out.push(syncedParagraph({
        blockId: block.id, parentId, kind, spans: spansOfBlock(block, kind),
        hasHiddenChildren: block.hasChildren && !expand && !isToken(kind),
      }));
      if (expand) await this.appendChildren(block.id, block.id, depth + 1, out);
    }
  }

  /** Re-reads the page's cover; failures are logged, never fatal. */
  async refreshPageMeta(): Promise<FileRef | null> {
    try {
      const meta = await this.api.retrievePage(this.pageId);
      const next = meta.cover ?? null;
      if (next?.url !== this.cover?.url || next?.expires !== this.cover?.expires) { this.cover = next; this.emit(); }
      return next;
    } catch (e) {
      this.log("error", `page meta failed: ${rawMessage(e)}`);
      return this.cover;
    }
  }

  // ---- remote refresh ----

  startPolling(): void {
    this.stopPollTimer();
    const tick = (): void => {
      this.pollTimer = setTimeout(() => {
        void this.refreshFromServer().finally(() => { if (this.pollTimer !== null) tick(); });
      }, this.t.pollIntervalMs);
    };
    tick();
  }

  private stopPollTimer(): void {
    if (this.pollTimer !== null) { clearTimeout(this.pollTimer); this.pollTimer = null; }
  }

  /** Stops polling and flushes any pending edit right away. */
  stopPolling(): Promise<void> {
    this.stopPollTimer();
    return this.flush();
  }

  /** Applies server changes only when idle, nothing is syncing and there are no unsynced local changes. */
  async refreshFromServer(): Promise<void> {
    if (!this.hasLoaded) return this.load();
    if (!this.canApplyRemote()) { this.log("debug", "refresh skipped: local activity"); return; }
    const generation = this.doc.editGeneration;
    try {
      const fetched = await this.fetchDocument();
      await this.refreshPageMeta();
      if (!this.canApplyRemote() || this.doc.editGeneration !== generation) {
        this.log("debug", "refresh dropped: edited while fetching");
        return;
      }
      const pending = plan(this.previous, this.doc.paragraphs()).filter((o) => o.t !== "restoreToken");
      if (pending.length > 0) {
        this.log("info", `refresh deferred: ${pending.length} unsynced local ops`);
        this.scheduleSync();
        return;
      }
      if (JSON.stringify(comparable(fetched)) !== JSON.stringify(comparable(this.previous))) {
        this.previous = fetched;
        this.doc.load(fetched, true);
        this.markRebuilt();
        await this.saveCache();
        this.log("info", `applied remote changes: ${fetched.length} blocks`);
      }
      this.errorMessage = null;
      this.emit();
    } catch (e) {
      this.log("error", `refresh failed: ${rawMessage(e)}`);
      this.errorMessage = humanMessage(e);
      this.emit();
    }
  }

  private canApplyRemote(): boolean {
    return !this.isSyncing && this.debounceTimer === null &&
      Date.now() - (this.doc.lastLocalEditAt ?? -Infinity) >= this.t.remoteQuietPeriodMs;
  }

  // ---- local edits, debounced sync ----

  noteLocalEdit(): void {
    this.updateEmpty();
    if (!this.hasLoaded) return;
    if (this.status.t !== "saving") this.setStatus({ t: "saving" });
    this.scheduleSync();
  }

  private scheduleSync(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.syncNow();
    }, this.t.debounceMs);
  }

  private cancelDebounce(): void {
    if (this.debounceTimer !== null) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
  }

  /** Cancels the debounce and syncs now if anything is unsynced. Resolves when that sync ends. */
  flush(): Promise<void> {
    if (!this.hasLoaded || !this.hasUnsyncedChanges) return Promise.resolve();
    this.cancelDebounce();
    return this.syncNow();
  }

  confirmMassDelete(): Promise<void> {
    this.massDeleteConfirmed = true;
    return this.syncNow();
  }

  /** Runs passes until the document matches the confirmed state (or a pass fails). */
  async syncNow(): Promise<void> {
    this.cancelDebounce();
    if (!this.hasLoaded) { this.log("info", "sync skipped: page not loaded"); return; }
    if (this.isSyncing) { this.syncAgain = true; return; }
    this.isSyncing = true;
    if (this.retryTimer !== null) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    let passes = 0;
    do {
      this.syncAgain = false;
      const ok = await this.runPass();
      passes++;
      if (!ok) break;
    } while (this.syncAgain && passes < engineConfig.maxPasses);
    this.isSyncing = false;
    if (!this.lastPassFailed && this.doc.editGeneration !== this.syncedGeneration && this.debounceTimer === null) {
      this.scheduleSync(); // edited while the pass ran
    }
    this.setStatus(this.settledStatus());
  }

  private settledStatus(): EditorSyncStatus {
    if (this.status.t === "offline" && this.lastPassFailed) return this.status;
    if (this.status.t === "error" && (this.lastPassFailed || this.pendingMassDelete !== null)) return this.status;
    return this.debounceTimer !== null || this.doc.editGeneration !== this.syncedGeneration ? { t: "saving" } : { t: "saved" };
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.log("info", "retrying sync after transient failure");
      void this.syncNow();
    }, this.t.retryIntervalMs);
  }

  /** Cancels every timer (page view unmounted). */
  dispose(): void {
    this.cancelDebounce();
    this.stopPollTimer();
    for (const t of [this.retryTimer, this.hintTimer]) if (t !== null) clearTimeout(t);
    this.retryTimer = null;
    this.hintTimer = null;
    this.listeners.clear();
  }

  // ---- executor ----

  /** Blocks a set of delete ops would remove, nested children included (PORT 9.3 fix). */
  private deletedBlockCount(ops: EditorSyncOp[]): number {
    const children = new Map<string, string[]>();
    for (const p of this.previous) {
      if (p.parentId !== null) children.set(p.parentId, [...(children.get(p.parentId) ?? []), p.blockId]);
    }
    const count = (id: string): number => 1 + (children.get(id) ?? []).reduce((n, c) => n + count(c), 0);
    return ops.reduce((n, o) => (o.t === "delete" ? n + count(o.blockId) : n), 0);
  }

  /** One plan + execute pass. False if it failed (status already set). */
  private async runPass(): Promise<boolean> {
    let generation = this.doc.editGeneration;
    let snapshot = this.doc.paragraphs();
    let ops = plan(this.previous, snapshot);

    const restores = ops.filter((o) => o.t === "restoreToken");
    if (restores.length > 0) {
      for (const r of restores) {
        if (r.t === "restoreToken" && r.token.kind.t === "token") {
          this.log("info", `restore token ${r.token.blockId} (${r.token.kind.type}); tokens are never deleted from the editor`);
          this.doc.restoreToken({ blockId: r.token.blockId, type: r.token.kind.type, title: r.token.kind.title }, r.depth, r.afterBlockId);
        }
      }
      this.showRestoredHint(restores.length);
      this.cancelDebounce(); // the restore itself is not a user edit worth a second pass
      generation = this.doc.editGeneration;
      snapshot = this.doc.paragraphs();
      ops = plan(this.previous, snapshot);
    }
    const spansByBlock = new Map<string, RichTextSpan[]>();
    for (const p of snapshot) if (p.blockId !== null) spansByBlock.set(p.blockId, p.spans);
    ops = ops.filter((o) => o.t !== "restoreToken");

    // Safety net: a sync that would trash most of the page needs an explicit confirmation.
    const deletes = this.deletedBlockCount(ops);
    const textBlocks = this.previous.filter((p) => !isToken(p.kind)).length;
    if (deletes >= 3 && deletes * 2 > textBlocks && !this.massDeleteConfirmed) {
      this.pendingMassDelete = deletes;
      this.setStatus({ t: "error", message: `Not saved: this would delete ${deletes} blocks.` });
      this.lastPassFailed = true;
      this.log("info", `held back: ${deletes} deletes of ${textBlocks} blocks need confirmation`);
      return false;
    }
    this.massDeleteConfirmed = false;
    this.pendingMassDelete = null;

    if (ops.length === 0) {
      this.syncedGeneration = generation;
      this.lastPassFailed = false;
      return true;
    }
    this.setStatus({ t: "saving" });
    this.log("info", `sync pass: ${ops.length} ops`);
    const localToBlock = new Map<string, string>();
    const failedLocal = new Set<string>();
    const errors: string[] = [];
    let transient: string | null = null;
    const resolve = (localId: string): string | null => {
      if (failedLocal.has(localId)) return null;
      return localToBlock.get(localId) ?? this.doc.blockIdForLocal(localId);
    };

    opLoop: for (const op of ops) {
      switch (op.t) {
        case "update": {
          const spans = spansByBlock.get(op.blockId) ?? spansFromContent(op.content, op.kind);
          const previousKind = this.previous.find((p) => p.blockId === op.blockId)?.kind;
          const outcome = await this.api.queueSubmit({
            kind: "updateBlock", blockId: op.blockId, type: apiType(op.kind), update: blockUpdate(op.kind, spans, previousKind),
          }, false);
          if (outcome.kind === "saved") {
            this.confirmUpdate(op.blockId, op, spans);
            this.log("info", `update ${op.blockId} ${apiType(op.kind)}: ok`);
          } else if (outcome.kind === "queued") {
            this.log("error", `update ${op.blockId}: transient failure: ${outcome.message}`);
            transient = outcome.message;
            break opLoop;
          } else if (isGone(outcome.message)) {
            // Deleted in Notion meanwhile: forget the id so the paragraph is re-inserted.
            this.confirmDelete(op.blockId);
            this.doc.clearBlockId(op.blockId);
            this.syncAgain = true;
          } else {
            this.log("error", `update ${op.blockId} failed: ${outcome.message}`);
            errors.push(outcome.message);
          }
          break;
        }
        case "insert": {
          const localIds = op.paragraphs.map((p) => p.localId);
          const parentId = op.parent.t === "page" ? this.pageId : op.parent.t === "block" ? op.parent.id : resolve(op.parent.localId);
          let position: BlockPosition | null;
          if (op.position.t === "start") position = positionStart;
          else if (op.position.t === "after") position = positionAfter(op.position.blockId);
          else { const r = resolve(op.position.localId); position = r === null ? null : positionAfter(r); }
          if (parentId === null || position === null) {
            this.log("error", `insert of ${op.paragraphs.length} skipped: unresolved parent/anchor (an earlier insert failed)`);
            for (const id of localIds) failedLocal.add(id);
            continue;
          }
          try {
            const created = await this.api.appendBlocks(parentId, await this.prepareBlocks(op.paragraphs), position);
            if (created.length < op.paragraphs.length) {
              throw new DecodingError(`appendBlocks returned ${created.length} blocks for ${op.paragraphs.length}`);
            }
            const synced: SyncedParagraph[] = [];
            op.paragraphs.forEach((paragraph, i) => {
              const block = created[i]!;
              localToBlock.set(paragraph.localId, block.id);
              if (!this.doc.setBlockId(paragraph.localId, block.id)) {
                this.log("info", `inserted ${block.id} but its paragraph is gone; will delete next pass`);
              }
              // An image's confirmed kind is Notion's own (hosted file URL), not the upload id.
              const served = kindOfBlock(block);
              const kind = isImage(paragraph.kind) && isImage(served) ? served : paragraph.kind;
              synced.push(syncedParagraph({
                blockId: block.id, parentId: op.parent.t === "page" ? null : parentId, kind, spans: paragraph.spans,
              }));
            });
            this.confirmInsert(synced, op.parent.t === "page" ? null : parentId, position);
            this.log("info", `insert ${op.paragraphs.length} under ${parentId}: ok ${created.map((b) => b.id).join(",")}`);
          } catch (e) {
            if (isTransient(e)) {
              this.log("error", `insert transient failure: ${rawMessage(e)}`);
              transient = rawMessage(e);
              break opLoop;
            }
            this.log("error", `insert failed: ${rawMessage(e)}`);
            for (const id of localIds) failedLocal.add(id);
            errors.push(humanMessage(e));
          }
          break;
        }
        case "delete": {
          const outcome = await this.api.queueSubmit({ kind: "deleteBlock", blockId: op.blockId }, false);
          if (outcome.kind === "saved") {
            this.confirmDelete(op.blockId);
            this.log("info", `delete ${op.blockId}: ok`);
          } else if (outcome.kind === "queued") {
            this.log("error", `delete ${op.blockId}: transient failure: ${outcome.message}`);
            transient = outcome.message;
            break opLoop;
          } else if (isGone(outcome.message)) {
            this.confirmDelete(op.blockId);
            this.log("info", `delete ${op.blockId}: already gone`);
          } else {
            this.log("error", `delete ${op.blockId} failed: ${outcome.message}`);
            errors.push(outcome.message);
          }
          break;
        }
        case "restoreToken":
          break;
      }
    }

    await this.saveCache();
    if (transient !== null) {
      this.lastPassFailed = true;
      this.setStatus({ t: "offline", message: transient });
      this.scheduleRetry();
      return false;
    }
    if (errors.length > 0) {
      this.lastPassFailed = true;
      this.setStatus({ t: "error", message: `Not saved: ${errors[0]}` });
      return false;
    }
    this.lastPassFailed = false;
    if (this.doc.editGeneration === generation) {
      this.syncedGeneration = generation;
      // Self-check: a fully confirmed pass must leave nothing to do.
      const leftover = plan(this.previous, this.doc.paragraphs()).filter((o) => o.t !== "restoreToken");
      if (leftover.length > 0) {
        this.log("error", `post-sync plan not empty (${leftover.length} ops): ${JSON.stringify(leftover)}`);
        this.syncAgain = true;
      }
    }
    return true;
  }

  // ---- confirmed-state bookkeeping ----

  private confirmUpdate(blockId: string, op: Extract<EditorSyncOp, { t: "update" }>, spans: RichTextSpan[]): void {
    const i = this.previous.findIndex((p) => p.blockId === blockId);
    if (i >= 0) this.previous[i] = withContent(this.previous[i]!, op.kind, spans);
  }

  private confirmDelete(blockId: string): void {
    const removed = new Set<string>([blockId]);
    this.previous = this.previous.filter((b) => {
      if (removed.has(b.blockId)) return false;
      if (b.parentId !== null && removed.has(b.parentId)) {
        removed.add(b.blockId); // pre-order: descendants follow their parent
        return false;
      }
      return true;
    });
  }

  private confirmInsert(blocks: SyncedParagraph[], parentId: string | null, position: BlockPosition): void {
    let index = this.previous.length;
    if ("start" in position) {
      if (parentId !== null) {
        const p = this.previous.findIndex((b) => b.blockId === parentId);
        if (p >= 0) index = p + 1;
      } else index = 0;
    } else if ("after" in position) {
      const anchor = position.after._0;
      const a = this.previous.findIndex((b) => b.blockId === anchor);
      if (a >= 0) {
        index = a + 1;
        const subtree = new Set<string>([anchor]);
        while (index < this.previous.length) {
          const parent = this.previous[index]!.parentId;
          if (parent === null || !subtree.has(parent)) break;
          subtree.add(this.previous[index]!.blockId);
          index++;
        }
      }
    }
    this.previous.splice(index, 0, ...blocks);
  }

  private async saveCache(): Promise<void> {
    try { await this.cache?.save(this.previous); } catch (e) { this.log("error", `cache save failed: ${rawMessage(e)}`); }
  }

  private updateEmpty(): void {
    const empty = this.doc.isEmpty;
    if (empty !== this.isDocumentEmpty) { this.isDocumentEmpty = empty; this.emit(); }
  }

  private showRestoredHint(count: number): void {
    this.restoredTokenHint = count === 1
      ? "Restored a block that can't be deleted here. Delete it in Notion."
      : `Restored ${count} blocks that can't be deleted here. Delete them in Notion.`;
    if (this.hintTimer !== null) clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      this.hintTimer = null;
      this.restoredTokenHint = null;
      this.emit();
    }, engineConfig.restoredHintMs);
    this.emit();
  }

  // ---- images (engineImages.ts) ----

  insertImage(data: Uint8Array, filename: string, contentType: string, afterParagraphIndex: number): Promise<boolean> {
    return insertImage(this, data, filename, contentType, afterParagraphIndex);
  }

  freshImageUrl(blockId: string): Promise<string | null> {
    return freshImageUrl(this, blockId);
  }

  private prepareBlocks(paragraphs: DocParagraph[]) {
    return prepareBlocks(this, paragraphs);
  }

  setError(message: string | null): void {
    this.errorMessage = message;
    this.emit();
  }
}
