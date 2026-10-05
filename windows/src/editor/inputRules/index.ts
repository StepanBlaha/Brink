import { InputRule, inputRules, undoInputRule } from "prosemirror-inputrules";
import type { Plugin } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import { blockShortcutKind, inlineMatch } from "../../domain/markdown/inputShortcuts";
import { textKind, setKind, blockOf } from "../blockOps";
import { kindOf, isCodeKind } from "../schema";
import { schema } from "../schema";

const typedFallback = (s: string): string => s;
const markName = { bold: "bold", italic: "italic", strikethrough: "strike", code: "code" } as const;

const blockRule = new InputRule(/^(?:#{1,3}|[-*+>]|\[[ xX]?\]|- \[[ xX]\]|!>|\d+\.) $|^```$/, (state, match, start, end) => {
  if (!state.selection.empty) return null;
  const { node, pos } = blockOf(state.selection.$from);
  const kind = blockShortcutKind(match[0], kindOf(node));
  if (!kind) return null;
  const tr = state.tr.delete(start, end);
  setKind(tr, pos, kind);
  return closeHistory(tr);
});

const inlineRule = new InputRule(/[*_~`)]$/, (state, match, _start, end) => {
  if (!state.selection.empty) return null;
  const { $from } = state.selection;
  const block = $from.parent;
  if (!textKind(block) || isCodeKind(block) || $from.marks().some((m) => m.type.name === "code")) return null;
  const input = match.input ?? typedFallback(match[0]);
  const typed = match[0];
  const before = input.length - typed.length;
  const m = inlineMatch(input);
  if (!m) return null;
  const at = (i: number) => end - before + i;
  const tr = state.tr;
  tr.delete(at(m.inner[1]), end); // closing marker (the last char is not in the doc yet)
  tr.delete(at(m.whole[0]), at(m.inner[0]));
  const from = at(m.whole[0]);
  const to = from + (m.inner[1] - m.inner[0]);
  const s = m.style;
  tr.addMark(from, to, s.t === "link" ? schema.marks["link"]!.create({ href: s.url }) : schema.marks[markName[s.t]]!.create());
  tr.setStoredMarks([]);
  return closeHistory(tr);
});

export const brinkInputRules = (): Plugin => inputRules({ rules: [blockRule, inlineRule] });
export { undoInputRule };
