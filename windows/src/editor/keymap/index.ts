import { baseKeymap, chainCommands } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import type { Plugin } from "prosemirror-state";
import { undoInputRule } from "../inputRules";
import { backspaceCommand } from "./backspace";
import { enterCommand, softBreak } from "./enter";
import { indent, outdent } from "./indent";
import { toggle } from "./marks";
import { moveBlockDown, moveBlockUp } from "./moveBlock";

/** Keymap and history (PORT 3.c.7); Ctrl for the Mac's Command. */
export function brinkKeymap(): Plugin[] {
  return [
    history(),
    keymap({
      "Mod-z": chainCommands(undoInputRule, undo),
      "Mod-y": redo,
      "Mod-Shift-z": redo,
      Backspace: chainCommands(undoInputRule, backspaceCommand),
      Enter: enterCommand,
      "Shift-Enter": softBreak,
      Tab: indent,
      "Shift-Tab": outdent,
      "Alt-Shift-ArrowUp": moveBlockUp,
      "Alt-Shift-ArrowDown": moveBlockDown,
      "Mod-b": toggle("bold"),
      "Mod-i": toggle("italic"),
      "Mod-e": toggle("code"),
      "Mod-Shift-x": toggle("strike"),
    }),
    keymap(baseKeymap),
  ];
}
