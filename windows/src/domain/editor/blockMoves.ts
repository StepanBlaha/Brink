import { maxDepth as maxDepthLimit } from "../markdown/paragraphSyntax";

/** Pure index math of EditorCommands+Blocks.moveBlock (the editors apply the result). */
export interface Movable { depth: number }

export interface MovePlan {
  /** Source indices in their new order, covering the affected region [lo, hi]. */
  order: number[];
  lo: number;
  hi: number;
  /** New depth per source index (only the moved subtree changes). */
  depths: Map<number, number>;
  /** Index of the moved root in the original list. */
  root: number;
}

/** Index range of the block at `index` plus its indented children. */
export function subtree(list: Movable[], index: number): [number, number] {
  let end = index;
  while (end + 1 < list.length && list[end + 1]!.depth > list[index]!.depth) end++;
  return [index, end];
}

/** The deepest depth a block may take when inserted before paragraph `target`. */
export function maxDepthForMove(list: Movable[], at: number, target: number): number {
  const [, e] = subtree(list, at);
  const above = target === e + 1 ? at - 1 : target - 1;
  if (above < 0 || above >= list.length) return 0;
  return Math.min(list[above]!.depth + 1, maxDepthLimit);
}

/**
 * Moves the block at `at` (with its children) so it sits before paragraph index `target`
 * (`list.length` = at the end), at `requestedDepth` (clamped; children keep their relative
 * indent). Null for a no-op / invalid drop.
 */
export function planMove(list: Movable[], at: number, target: number, requestedDepth: number): MovePlan | null {
  if (at < 0 || at >= list.length) return null;
  const s = at;
  const [, e] = subtree(list, s);
  const t = Math.max(0, Math.min(target, list.length));
  if (t > s && t <= e) return null; // into itself
  const oldDepth = list[s]!.depth;
  const newDepth = Math.max(0, Math.min(requestedDepth, maxDepthForMove(list, s, t)));
  const stays = t === s || t === e + 1;
  if (stays && newDepth === oldDepth) return null;
  const range = (a: number, b: number): number[] => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
  const block = range(s, e + 1);
  let order: number[]; let lo: number; let hi: number;
  if (stays) { order = block; lo = s; hi = e; }
  else if (t < s) { order = [...block, ...range(t, s)]; lo = t; hi = e; }
  else { order = [...range(e + 1, t), ...block]; lo = s; hi = t - 1; }
  const delta = newDepth - oldDepth;
  const depths = new Map<number, number>();
  for (const i of block) {
    depths.set(i, i === s ? newDepth : Math.max(Math.min(newDepth + 1, maxDepthLimit), Math.min(list[i]!.depth + delta, maxDepthLimit)));
  }
  return { order, lo, hi, depths, root: s };
}

/** Alt+Shift+Up target: before the nearest previous block with depth <= own. Null at the top. */
export function moveUpTarget(list: Movable[], at: number): { target: number; depth: number } | null {
  const depth = list[at]?.depth;
  if (depth === undefined) return null;
  for (let p = at - 1; p >= 0; p--) if (list[p]!.depth <= depth) return { target: p, depth };
  return null;
}

/** Alt+Shift+Down target: after the next block's subtree. Null at the bottom. */
export function moveDownTarget(list: Movable[], at: number): { target: number; depth: number } | null {
  if (at < 0 || at >= list.length) return null;
  const next = subtree(list, at)[1] + 1;
  if (next >= list.length) return null;
  return { target: subtree(list, next)[1] + 1, depth: list[at]!.depth };
}
