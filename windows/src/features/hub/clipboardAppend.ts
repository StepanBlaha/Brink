import { mapClipboard, type ClipboardContent } from "../../domain/capture/clipboardMapper";
import type { Operation } from "../../domain/notion/pendingWrite";
import { positionEnd } from "../../domain/notion/newBlock";
import type { Pin } from "../../domain/store/pin";
import type { Settings } from "../../ipc/types";
import type { QueueOutcome } from "../../ipc/types";

export interface ClipboardAppendPorts {
  pins(): Pin[];
  /** The SAME settings object the app writes `lastOpenedPinID` into (plan 9 item 2: no key mismatch). */
  settings(): Partial<Pick<Settings, "lastOpenedPinID">>;
  readClipboard(): Promise<ClipboardContent>;
  submit(op: Operation): Promise<QueueOutcome>;
  toast(message: string, isError: boolean): void;
  contentChanged(pinId: string): void;
}

/** Ctrl+Alt+V: appends the clipboard to the last-opened page pin. */
export async function clipboardAppend(p: ClipboardAppendPorts): Promise<void> {
  const id = p.settings().lastOpenedPinID;
  const pin = id ? p.pins().find((x) => x.id === id) : undefined;
  if (!pin || pin.kind !== "page") {
    p.toast("Open a page pin first", true);
    return;
  }
  const mapped = mapClipboard(await p.readClipboard());
  if ("unsupported" in mapped) {
    p.toast(mapped.unsupported, true);
    return;
  }
  const out = await p.submit({ kind: "appendBlocks", parentId: pin.notionId, blocks: mapped.blocks, position: positionEnd });
  if (out.kind === "saved") {
    p.contentChanged(pin.id);
    p.toast(`Pasted into ${pin.title} ✓`, false);
  } else if (out.kind === "queued") p.toast("Saved offline, will sync", false);
  else p.toast(out.message, true);
}
