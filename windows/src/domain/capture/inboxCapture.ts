import type { Operation } from "../notion/pendingWrite";
import type { Pin, PinKind } from "../store/pin";
import { planCapture, type CapturePlan } from "./captureRequest";
import type { MarkdownPort } from "./captureMarkdown";
import { captureMarkdown } from "./captureMarkdown";

/** The text actually captured: URLs become Markdown links for pages, plain suffixes for databases. */
export function captureText(text: string, url: string | undefined, kind: PinKind): string {
  const note = text.trim();
  const u = url?.trim();
  if (!u) return note;
  if (note.includes(u)) return note;
  if (note === "") return u;
  if (kind === "page") return `[${note.replaceAll("[", "(").replaceAll("]", ")")}](${u})`;
  return `${note} ${u}`;
}

/** Requested pin, else the fallback (last quick-capture pin), else the first pin by order. */
export function destination(pinId: string | undefined, pins: Pin[], fallbackID: string | undefined): Pin | null {
  const byId = (id: string | undefined): Pin | undefined => (id ? pins.find((p) => p.id === id) : undefined);
  const found = byId(pinId) ?? byId(fallbackID);
  if (found) return found;
  return [...pins].sort((a, b) => a.order - b.order)[0] ?? null;
}

export function planInbox(
  args: { text: string; url?: string; pinId?: string; pins: Pin[]; fallbackID?: string },
  now: Date = new Date(),
  md: MarkdownPort = captureMarkdown,
): { pin: Pin; plan: CapturePlan } | null {
  const pin = destination(args.pinId, args.pins, args.fallbackID);
  if (!pin) return null;
  const combined = captureText(args.text, args.url, pin.kind);
  const plan = planCapture(combined, pin, pin.config?.dateProperty ?? null, now, md);
  return plan ? { pin, plan } : null;
}

/** Tick semantics: page to_do.checked; database the done property. */
export function toggleOperation(pin: Pin, itemId: string, checked: boolean): Operation | null {
  if (pin.kind === "page") {
    return { kind: "updateBlock", blockId: itemId, type: "to_do", update: { kind: "checked", checked } };
  }
  const c = pin.config;
  if (!c) return null;
  if (c.doneKind === "checkbox") {
    return { kind: "toggleDone", pageId: itemId, update: { name: c.doneProperty, value: { type: "checkbox", checkbox: checked } } };
  }
  if (!checked || !c.doneValue) return null;
  return { kind: "toggleDone", pageId: itemId, update: { name: c.doneProperty, value: { type: "status", status: { name: c.doneValue } } } };
}
