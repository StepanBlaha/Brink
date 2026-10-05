/** Errors from Tauri commands are `AppError` objects: { kind, message, transient }. */
interface ErrorLike { kind?: unknown; message?: unknown; transient?: unknown }

const asLike = (e: unknown): ErrorLike => (typeof e === "object" && e !== null ? (e as ErrorLike) : {});

export function isTransient(e: unknown): boolean {
  return asLike(e).transient === true;
}

export function rawMessage(e: unknown): string {
  const m = asLike(e).message;
  if (typeof m === "string") return m;
  return typeof e === "string" ? e : String(e);
}

/** PageEditorEngine.humanMessage: notFound / notShared get the page-level wording. */
export function humanMessage(e: unknown): string {
  const kind = asLike(e).kind;
  if (kind === "notFound" || kind === "notShared") return "Page not found or not shared with your integration";
  return rawMessage(e);
}

/** The localized notFound message of the Rust client (NotionError::NotFound). */
export const notFoundMessage = "That Notion item was not found.";

/** "Gone" detection (PORT 9.15): the notFound message or an "archived" message. */
export function isGone(message: string): boolean {
  return message === notFoundMessage || message.toLowerCase().includes("archived");
}

export function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} bytes`;
}

export function tooLargeMessage(bytes: number): string {
  return `Image is too large (${formatSize(bytes)}); the limit is 20 MB.`;
}

/** A client-side failure that is not transient. */
export class DecodingError extends Error {
  readonly kind = "decoding";
  readonly transient = false;
}
