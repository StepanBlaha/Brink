import type { Plugin } from "prosemirror-state";
import type { SyncedParagraph } from "../domain/editor/types";
import { openUrl } from "../ipc/captureIpc";
import { BrinkDoc } from "./docPort";
import { identityPlugin } from "./identityPlugin";
import { brinkInputRules } from "./inputRules";
import { brinkKeymap } from "./keymap";
import { atomicGuard } from "./plugins/atomicGuard";
import { dragHandlePlugin } from "./plugins/dragHandle";
import { findPlugin } from "./plugins/find";
import { imagesPlugin } from "./plugins/images";
import { linkClickPlugin } from "./plugins/link";
import { gutterPlugin } from "./plugins/gutter";
import { pastePlugin } from "./plugins/paste";
import { placeholderPlugin } from "./plugins/placeholder";
import { slashPlugin } from "./plugins/slash";
import { toggleCollapsePlugin } from "./plugins/toggleCollapse";

/** The full plugin stack, in priority order (guard and slash see keys before the keymap). */
export function brinkPlugins(stamps: Map<string, string>, doc: () => BrinkDoc | null = () => null): Plugin[] {
  return [
    slashPlugin(), atomicGuard(), brinkInputRules(), ...brinkKeymap(), identityPlugin(stamps),
    imagesPlugin(doc), linkClickPlugin((url) => { void openUrl(url).catch(() => undefined); }), pastePlugin(), gutterPlugin(), toggleCollapsePlugin(), placeholderPlugin(), dragHandlePlugin(), findPlugin(),
  ];
}

export function createBrinkDoc(synced: SyncedParagraph[] = []): BrinkDoc {
  const stamps = new Map<string, string>();
  let made: BrinkDoc | null = null;
  made = new BrinkDoc(brinkPlugins(stamps, () => made), stamps, synced);
  return made;
}
