import { parseDeepLink } from "../../domain/capture/deepLink";
import { planInbox } from "../../domain/capture/inboxCapture";
import type { Operation } from "../../domain/notion/pendingWrite";
import type { Pin } from "../../domain/store/pin";
import type { QueueOutcome } from "../../ipc/types";

export interface DeepLinkPorts {
  pins(): Pin[];
  quickCaptureLastPinId(): string | undefined;
  openPin(pinId: string): void;
  submit(op: Operation): Promise<QueueOutcome>;
  toast(message: string, isError: boolean): void;
  contentChanged(pinId: string): void;
  now(): Date;
  /** `brink://notify?action=done|snooze|open&pinId=&itemId=` from a toast button. */
  notify?(params: Record<string, string>): void;
}

/** Routes one `brink://` URL (plan 3.l). Returns whether it was understood. */
export async function handleDeepLink(raw: string, p: DeepLinkPorts): Promise<boolean> {
  const link = parseDeepLink(raw);
  if (!link) return false;
  if (link.kind === "pin") {
    if (p.pins().some((x) => x.id === link.pinId)) p.openPin(link.pinId);
    else p.toast("That pin no longer exists", true);
    return true;
  }
  if (link.kind === "notify") {
    p.notify?.(link.params);
    return true;
  }
  if (link.kind !== "capture") return true; // oauth is dormant until M8
  const planned = planInbox(
    { text: link.text, ...(link.url ? { url: link.url } : {}), ...(link.pinId ? { pinId: link.pinId } : {}),
      pins: p.pins(), ...(p.quickCaptureLastPinId() ? { fallbackID: p.quickCaptureLastPinId()! } : {}) },
    p.now(),
  );
  if (!planned) {
    p.toast(p.pins().length === 0 ? "Pin a page or database first." : "Nothing to add", true);
    return true;
  }
  const out = await p.submit(planned.plan.operation);
  if (out.kind === "saved") {
    p.contentChanged(planned.pin.id);
    p.toast(`Added to ${planned.pin.title} ✓`, false);
  } else if (out.kind === "queued") p.toast("Saved offline, will sync", false);
  else p.toast(out.message, true);
  return true;
}
