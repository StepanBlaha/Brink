import type { Plugin } from "prosemirror-state";
import type { SyncedParagraph } from "../domain/editor/types";
import { BrinkDoc } from "./docPort";
import { identityPlugin } from "./identityPlugin";
import { brinkInputRules } from "./inputRules";
import { brinkKeymap } from "./keymap";
import { atomicGuard } from "./plugins/atomicGuard";
import { gutterPlugin } from "./plugins/gutter";
import { pastePlugin } from "./plugins/paste";
import { placeholderPlugin } from "./plugins/placeholder";
import { slashPlugin } from "./plugins/slash";
import { toggleCollapsePlugin } from "./plugins/toggleCollapse";

/** The full plugin stack, in priority order (guard and slash see keys before the keymap). */
export function brinkPlugins(stamps: Map<string, string>): Plugin[] {
  return [
    slashPlugin(), atomicGuard(), brinkInputRules(), ...brinkKeymap(), identityPlugin(stamps),
    pastePlugin(), gutterPlugin(), toggleCollapsePlugin(), placeholderPlugin(),
  ];
}

export function createBrinkDoc(synced: SyncedParagraph[] = []): BrinkDoc {
  const stamps = new Map<string, string>();
  return new BrinkDoc(brinkPlugins(stamps), stamps, synced);
}
