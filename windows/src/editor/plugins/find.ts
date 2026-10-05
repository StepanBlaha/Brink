import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";

export interface FindMatch { from: number; to: number }
export interface FindState { open: boolean; query: string; current: number; matches: FindMatch[]; focus: number }

export const findKey = new PluginKey<FindState>("brinkFind");

/** Lowercase and strip combining marks; `map[i]` is the original index of normalized char `i`. */
export function fold(text: string): { s: string; map: number[] } {
  let s = "";
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (let k = 0; k < f.length; k++) map.push(i);
    s += f;
    i += ch.length;
  }
  map.push(i);
  return { s, map };
}

/** Non-overlapping, case- and diacritic-insensitive matches of `query` in each block (positions in the doc). */
export function findMatches(doc: PMNode, query: string): FindMatch[] {
  const q = fold(query).s;
  if (q === "") return [];
  const out: FindMatch[] = [];
  doc.forEach((block, pos) => {
    const { s, map } = fold(block.textBetween(0, block.content.size, "\n", "￼"));
    for (let at = s.indexOf(q); at >= 0; at = s.indexOf(q, at + q.length)) {
      out.push({ from: pos + 1 + map[at]!, to: pos + 1 + map[at + q.length]! });
    }
  });
  return out;
}

const closed: FindState = { open: false, query: "", current: 0, matches: [], focus: 0 };

type FindMeta = { open?: string | true; close?: true; query?: string; step?: 1 | -1 };
export const findAction = (tr: Transaction, m: FindMeta): Transaction => tr.setMeta(findKey, m);

function reduce(prev: FindState, tr: Transaction, state: EditorState): FindState {
  const m = tr.getMeta(findKey) as FindMeta | undefined;
  if (m?.close) return closed;
  let next = prev;
  if (m?.open !== undefined) next = { ...next, open: true, focus: next.focus + 1, ...(typeof m.open === "string" ? { query: m.open } : {}) };
  if (m?.query !== undefined) next = { ...next, query: m.query, current: 0 };
  if (!next.open) return next;
  if (!m && !tr.docChanged) return next;
  const matches = findMatches(state.doc, next.query);
  let current = Math.min(next.current, Math.max(0, matches.length - 1));
  // keep the position: after typing the current index is the first match at or after the caret
  if (m?.open !== undefined || m?.query !== undefined) {
    const caret = state.selection.from;
    const i = matches.findIndex((x) => x.from >= caret);
    current = i >= 0 ? i : 0;
  }
  if (m?.step && matches.length > 0) current = (current + m.step + matches.length) % matches.length;
  return { ...next, matches, current };
}

/** Decorations only (never touches the document): the current match at 0.85 accent, others at 0.3. */
export const findPlugin = (): Plugin<FindState> =>
  new Plugin<FindState>({
    key: findKey,
    state: { init: () => closed, apply: (tr, prev, _old, state) => reduce(prev, tr, state) },
    props: {
      decorations(state) {
        const f = findKey.getState(state);
        if (!f?.open || f.matches.length === 0) return null;
        return DecorationSet.create(state.doc, f.matches.map((m, i) =>
          Decoration.inline(m.from, m.to, { class: i === f.current ? "find find-cur" : "find" })));
      },
    },
  });

export const countLabel = (f: FindState): string =>
  f.query.trim() === "" ? "" : f.matches.length === 0 ? "0 of 0" : `${f.current + 1} of ${f.matches.length}`;

/** Ctrl+F / F3 / Ctrl+G (Shift = previous) as find actions; null if the key is not a find key. */
export function findKeyAction(view: { state: EditorState }, e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): FindMeta | null {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === "f") {
    const { from, to } = view.state.selection;
    const sel = to - from > 0 && to - from < 200 ? view.state.doc.textBetween(from, to, " ", " ") : "";
    return { open: sel !== "" ? sel : true };
  }
  const step = e.shiftKey ? -1 : 1;
  if (e.key === "F3" || (mod && k === "g")) return findKey.getState(view.state)?.open ? { step } : { open: true };
  return null;
}
