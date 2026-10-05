import { decodeBlock, decodeBlocks, type Block } from "../domain/notion/block";
import { newBlockRequestJSON, positionRequestJSON, type BlockPosition, type NewBlock } from "../domain/notion/newBlock";
import { blockUpdateRequestJSON } from "../domain/notion/newBlock";
import { decodePageMeta, type PageMeta } from "../domain/notion/pageMeta";
import type { Operation } from "../domain/notion/pendingWrite";
import type { EngineApi } from "../domain/editor/ports";
import { notFoundMessage } from "../domain/editor/engineErrors";
import type { QueueOutcome } from "../ipc/types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export interface FakeRequest {
  method: string;
  path: string;
  body: Obj | null;
  rawBody: Uint8Array | null;
  contentType: string | null;
  /** "METHOD /path" */
  description: string;
}

export interface SeedItem { id: string; type: string; text?: string | null; extra?: Obj }

class NetworkFailure extends Error {
  readonly kind = "network";
  readonly transient = true;
}

/**
 * A tiny in-memory Notion (port of FakeNotionServer.swift): GET children, PATCH block, PATCH
 * children with `position`, DELETE block, file uploads, pages. Records every request as
 * "METHOD /path". Used as the engine's `EngineApi` (the Rust client is the real transport).
 */
export class FakeNotionServer {
  blocks = new Map<string, Obj>();
  children = new Map<string, string[]>();
  nextId = 1;
  log: FakeRequest[] = [];
  private failWrites = 0;
  pages = new Map<string, Obj>();
  /** File uploads: id to status. */
  uploads = new Map<string, string>();

  reset(): void {
    this.blocks.clear(); this.children.clear(); this.nextId = 1; this.log = []; this.failWrites = 0;
    this.pages.clear(); this.uploads.clear();
  }

  seedPage(id: string, json: Obj): void { this.pages.set(id, json); }

  /** The next `count` non-GET requests fail at the network level (not logged). */
  failNextWrites(count: number): void { this.failWrites = count; }

  /** Simulates someone editing a block's text in Notion. */
  remoteEdit(id: string, text: string): void {
    const block = this.blocks.get(id);
    if (!block) return;
    const type = block["type"] as string;
    const box = isObj(block[type]) ? { ...(block[type] as Obj) } : {};
    box["rich_text"] = [{ type: "text", text: { content: text }, plain_text: text }];
    block[type] = box;
  }

  seed(parent: string, items: SeedItem[]): void {
    for (const item of items) {
      const box: Obj = { ...(item.extra ?? {}) };
      if (item.text !== undefined && item.text !== null) {
        box["rich_text"] = item.text === "" ? [] : [{ type: "text", text: { content: item.text }, plain_text: item.text }];
      }
      this.blocks.set(item.id, { object: "block", id: item.id, type: item.type, [item.type]: box });
      this.children.set(parent, [...(this.children.get(parent) ?? []), item.id]);
    }
  }

  get writes(): FakeRequest[] { return this.log.filter((r) => r.method !== "GET"); }
  clearLog(): void { this.log = []; }
  childIds(parent: string): string[] { return [...(this.children.get(parent) ?? [])]; }

  plainText(id: string): string | null {
    const block = this.blocks.get(id);
    if (!block) return null;
    const box = block[block["type"] as string];
    if (!isObj(box) || !Array.isArray(box["rich_text"])) return null;
    return (box["rich_text"] as Obj[]).map((r) => String(r["plain_text"] ?? "")).join("");
  }

  /** Raw request handler: returns status and JSON, or throws a network failure. */
  handle(method: string, path: string, body: Obj | null, rawBody: Uint8Array | null = null, contentType: string | null = null): { status: number; json: unknown } {
    if (method !== "GET" && this.failWrites > 0) {
      this.failWrites--;
      throw new NetworkFailure("Network error: The Internet connection appears to be offline.");
    }
    this.log.push({ method, path, body, rawBody: body === null ? rawBody : null, contentType, description: `${method} ${path}` });
    return path.startsWith("/v1/file_uploads") ? this.handleUpload(method, path, body, rawBody, contentType) : this.route(method, path, body);
  }

  private err(status: number, code: string, message: string): { status: number; json: unknown } {
    return { status, json: { object: "error", code, message } };
  }
  private notFound() { return this.err(404, "object_not_found", "Not found"); }

  private render(id: string): Obj | null {
    const block = this.blocks.get(id);
    if (!block) return null;
    return { ...block, has_children: (this.children.get(id) ?? []).length > 0 };
  }

  private responseRichText(value: unknown): Obj[] {
    return (Array.isArray(value) ? value : []).filter(isObj).map((item) => {
      const text = isObj(item["text"]) ? (item["text"] as Obj) : {};
      const out: Obj = { ...item, plain_text: typeof text["content"] === "string" ? text["content"] : "" };
      if (isObj(text["link"]) && typeof (text["link"] as Obj)["url"] === "string") out["href"] = (text["link"] as Obj)["url"];
      return out;
    });
  }

  private route(method: string, path: string, body: Obj | null): { status: number; json: unknown } {
    const parts = path.split("/").filter((p) => p !== "");
    if (parts.length === 3 && parts[1] === "pages" && method === "GET") {
      const page = this.pages.get(parts[2]!);
      return page ? { status: 200, json: page } : this.notFound();
    }
    if (parts.length < 3 || parts[0] !== "v1" || parts[1] !== "blocks") return this.notFound();
    const id = parts[2]!;
    const isChildren = parts.length === 4 && parts[3] === "children";
    if (method === "GET" && isChildren) {
      const results = (this.children.get(id) ?? []).map((c) => this.render(c)).filter((r) => r !== null);
      return { status: 200, json: { object: "list", results, next_cursor: null, has_more: false } };
    }
    if (method === "GET" && !isChildren) {
      const r = this.render(id);
      return r ? { status: 200, json: r } : this.notFound();
    }
    if (method === "PATCH" && isChildren) return this.append(id, body);
    if (method === "PATCH") return this.patch(id, body);
    if (method === "DELETE" && !isChildren) {
      if (!this.blocks.has(id)) return this.notFound();
      const rendered = this.render(id);
      this.blocks.delete(id);
      for (const [k, v] of this.children) this.children.set(k, v.filter((c) => c !== id));
      return { status: 200, json: rendered };
    }
    return this.notFound();
  }

  private append(id: string, body: Obj | null): { status: number; json: unknown } {
    if (!(id.startsWith("page") || this.blocks.has(id))) return this.notFound();
    const list = [...(this.children.get(id) ?? [])];
    let index = list.length;
    const position = body?.["position"];
    if (isObj(position)) {
      if (position["type"] === "start") index = 0;
      else if (position["type"] === "after_block") {
        const after = isObj(position["after_block"]) ? (position["after_block"] as Obj)["id"] : undefined;
        const i = typeof after === "string" ? list.indexOf(after) : -1;
        if (i < 0) return this.err(400, "validation_error", "after_block is not a child of the parent");
        index = i + 1;
      }
    }
    const created: Obj[] = [];
    for (const child of (Array.isArray(body?.["children"]) ? (body!["children"] as unknown[]) : []).filter(isObj)) {
      const newId = `new-${this.nextId++}`;
      const type = typeof child["type"] === "string" ? child["type"] : "paragraph";
      let box: Obj = isObj(child[type]) ? { ...(child[type] as Obj) } : {};
      if (type === "image") {
        // Notion turns an attached upload into its own hosted file.
        if (box["type"] === "file_upload") {
          const uploadId = isObj(box["file_upload"]) && typeof (box["file_upload"] as Obj)["id"] === "string" ? ((box["file_upload"] as Obj)["id"] as string) : "";
          if (this.uploads.get(uploadId) !== "uploaded") return this.err(400, "validation_error", `file upload ${uploadId} is not uploaded`);
          this.uploads.set(uploadId, "attached");
          box = { type: "file", caption: [], file: { url: `https://files.example/${uploadId}.png?X-Amz-Signature=abc`, expiry_time: "2030-01-01T00:00:00.000Z" } };
        }
      } else box["rich_text"] = this.responseRichText(box["rich_text"]);
      this.blocks.set(newId, { object: "block", id: newId, type, [type]: box });
      list.splice(index, 0, newId);
      index++;
      created.push(this.render(newId)!);
    }
    this.children.set(id, list);
    return { status: 200, json: { object: "list", results: created, next_cursor: null, has_more: false } };
  }

  private patch(id: string, body: Obj | null): { status: number; json: unknown } {
    const block = this.blocks.get(id);
    if (!block) return this.notFound();
    const type = block["type"] as string;
    if (typeof body?.["type"] === "string" && body["type"] !== type) return this.err(400, "validation_error", "type mismatch");
    const box: Obj = isObj(block[type]) ? { ...(block[type] as Obj) } : {};
    const patch = isObj(body?.[type]) ? (body![type] as Obj) : {};
    for (const [k, v] of Object.entries(patch)) box[k] = k === "rich_text" ? this.responseRichText(v) : v;
    block[type] = box;
    return { status: 200, json: this.render(id) ?? {} };
  }

  /** POST /v1/file_uploads and POST /v1/file_uploads/{id}/send (multipart, field `file`). */
  private handleUpload(method: string, path: string, body: Obj | null, raw: Uint8Array | null, contentType: string | null): { status: number; json: unknown } {
    const parts = path.split("/").filter((p) => p !== "");
    if (method !== "POST") return this.notFound();
    if (parts.length === 2) {
      const id = `fu-${this.nextId++}`;
      this.uploads.set(id, "pending");
      return { status: 200, json: {
        object: "file_upload", id, status: "pending", filename: body?.["filename"] ?? null,
        content_type: body?.["content_type"] ?? null, upload_url: `https://api.notion.com/v1/file_uploads/${id}/send`,
      } };
    }
    if (!(parts.length === 4 && parts[3] === "send" && this.uploads.get(parts[2]!) === "pending")) return this.notFound();
    const text = raw ? new TextDecoder("latin1").decode(raw) : "";
    if (!contentType?.startsWith("multipart/form-data; boundary=") || !text.includes('name="file"')) {
      return this.err(400, "validation_error", "expected multipart form-data with a file field");
    }
    this.uploads.set(parts[2]!, "uploaded");
    return { status: 200, json: { object: "file_upload", id: parts[2], status: "uploaded" } };
  }

  // ---- EngineApi over the fake ----

  private call(method: string, path: string, body: Obj | null = null, raw: Uint8Array | null = null, contentType: string | null = null): unknown {
    const { status, json } = this.handle(method, path, body, raw, contentType);
    if (status >= 200 && status < 300) return json;
    if (status === 404) throw { kind: "notFound", message: notFoundMessage, transient: false };
    const j = json as Obj;
    throw { kind: "api", message: `Notion API error (${String(j["code"])}): ${String(j["message"])}`, transient: false };
  }

  api(): EngineApi {
    return {
      blockChildren: async (id) => decodeBlocks(this.call("GET", `/v1/blocks/${id}/children`)),
      retrievePage: async (id): Promise<PageMeta> => decodePageMeta(this.call("GET", `/v1/pages/${id}`)),
      retrieveBlock: async (id): Promise<Block> => decodeBlock(this.call("GET", `/v1/blocks/${id}`)),
      appendBlocks: async (parentId, blocks: NewBlock[], position: BlockPosition) => {
        const body: Obj = { children: blocks.map(newBlockRequestJSON) };
        const pos = positionRequestJSON(position);
        if (pos !== null) body["position"] = pos;
        return decodeBlocks(this.call("PATCH", `/v1/blocks/${parentId}/children`, body));
      },
      queueSubmit: async (op: Operation): Promise<QueueOutcome> => {
        try {
          if (op.kind === "updateBlock") this.call("PATCH", `/v1/blocks/${op.blockId}`, blockUpdateRequestJSON(op.type, op.update));
          else if (op.kind === "deleteBlock") this.call("DELETE", `/v1/blocks/${op.blockId}`);
          else throw new Error(`fake queue: unsupported ${op.kind}`);
          return { kind: "saved" };
        } catch (e) {
          const err = e as { message: string; transient?: boolean };
          return err.transient ? { kind: "queued", message: err.message } : { kind: "failed", message: err.message };
        }
      },
      uploadFile: async (data, filename, contentType) => {
        const created = this.call("POST", "/v1/file_uploads", { mode: "single_part", filename, content_type: contentType }) as Obj;
        const id = String(created["id"]);
        const boundary = "NotionDock-TEST";
        const head = new TextEncoder().encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`);
        const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
        const raw = new Uint8Array(head.length + data.length + tail.length);
        raw.set(head, 0); raw.set(data, head.length); raw.set(tail, head.length + data.length);
        this.call("POST", `/v1/file_uploads/${id}/send`, null, raw, `multipart/form-data; boundary=${boundary}`);
        return id;
      },
    };
  }
}
