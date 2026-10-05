import { canHaveChildren, isImage, isToken, kindEquals, apiType } from "../markdown/paragraphKind";
import { maxDepth } from "../markdown/paragraphSyntax";
import type { DocParagraph, EditorSyncOp, InsertParent, InsertPosition, SyncedParagraph } from "./types";
import { heaviestIncreasingSubsequence } from "./plannerOrder";

export const maxBlocksPerAppend = 100;

/**
 * Pure, exact-identity sync planning (port of EditorSyncPlanner.plan): same id means same block;
 * a changed API type, parent or order is a recreate (insert + delete).
 */
export function plan(previous: SyncedParagraph[], current: DocParagraph[]): EditorSyncOp[] {
  const n = current.length;
  const prevIndex = new Map<string, number>();
  previous.forEach((p, i) => { if (!prevIndex.has(p.blockId)) prevIndex.set(p.blockId, i); });

  // 1. Structural parent: nearest earlier paragraph with a smaller indent that can have children.
  const parentIdx: (number | null)[] = new Array<number | null>(n).fill(null);
  const stack: { depth: number; index: number }[] = [];
  for (let i = 0; i < n; i++) {
    const depth = Math.max(0, Math.min(current[i]!.depth, maxDepth));
    while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth) stack.pop();
    let p: number | null = stack.length > 0 ? stack[stack.length - 1]!.index : null;
    while (p !== null && !canHaveChildren(current[p]!.kind)) p = parentIdx[p]!;
    parentIdx[i] = p;
    stack.push({ depth, index: i });
  }

  // 2. Candidate retention in document order.
  const retained: (string | null)[] = new Array<string | null>(n).fill(null);
  const placed: boolean[] = new Array<boolean>(n).fill(false);
  const used = new Set<string>();
  const serverParentMatches = (i: number, prev: SyncedParagraph): boolean => {
    const p = parentIdx[i]!;
    if (p === null) return prev.parentId === null;
    const parentId = retained[p];
    if (parentId === null || parentId === undefined) return false;
    return parentId === prev.parentId;
  };
  for (let i = 0; i < n; i++) {
    const c = current[i]!;
    const id = c.blockId;
    if (id === null) continue;
    const pi = prevIndex.get(id);
    if (pi === undefined || used.has(id)) continue;
    const prev = previous[pi]!;
    if (isToken(prev.kind) || isToken(c.kind)) {
      if (!(isToken(prev.kind) && isToken(c.kind))) continue;
      retained[i] = id;
      placed[i] = serverParentMatches(i, prev);
      used.add(id);
      continue;
    }
    const parentOK = serverParentMatches(i, prev);
    if ((apiType(prev.kind) === apiType(c.kind) && parentOK) || prev.hasHiddenChildren) {
      retained[i] = id;
      placed[i] = parentOK;
      used.add(id);
    }
  }

  // 3. Order: keep the heaviest increasing run of server positions within each parent.
  const subtreeSize: number[] = new Array<number>(n).fill(1);
  for (let i = n - 1; i >= 0; i--) {
    const p = parentIdx[i]!;
    if (p !== null) subtreeSize[p]! += subtreeSize[i]!;
  }
  const groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    if (retained[i] !== null && placed[i] && !isToken(current[i]!.kind)) {
      const p = parentIdx[i]!;
      const key = (p !== null ? retained[p] : null) ?? "#page";
      const list = groups.get(key) ?? [];
      list.push(i);
      groups.set(key, list);
    }
  }
  for (const members of groups.values()) {
    if (members.length <= 1) continue;
    const positions = members.map((i) => prevIndex.get(retained[i]!)!);
    const weights = members.map((i) => {
      const prev = previous[prevIndex.get(retained[i]!)!]!;
      if (prev.hasHiddenChildren || isImage(current[i]!.kind)) return 1_000_000;
      return 1_000 + Math.min(subtreeSize[i]!, 999);
    });
    const keep = new Set(heaviestIncreasingSubsequence(positions, weights).map((k) => members[k]!));
    for (const i of members) {
      if (!keep.has(i)) { retained[i] = null; placed[i] = false; }
    }
  }

  // 4. Cascade: a child whose parent is being recreated must be recreated under it.
  for (let i = 0; i < n; i++) {
    const id = retained[i];
    if (id === null || id === undefined || isToken(current[i]!.kind)) continue;
    const pi = prevIndex.get(id);
    if (pi === undefined) continue;
    const prev = previous[pi]!;
    if (!serverParentMatches(i, prev)) {
      if (prev.hasHiddenChildren) placed[i] = false;
      else { retained[i] = null; placed[i] = false; }
    }
  }

  const ops: EditorSyncOp[] = [];
  const retainedSet = new Set(retained.filter((x): x is string => x !== null));

  // 5. Token restores (local only), anchored after the nearest earlier surviving block.
  const depthOf = new Map<string, number>();
  for (const p of previous) {
    const parentDepth = p.parentId !== null ? depthOf.get(p.parentId) : undefined;
    depthOf.set(p.blockId, parentDepth !== undefined ? parentDepth + 1 : 0);
  }
  let lastSurvivor: string | null = null;
  for (const prev of previous) {
    if (isToken(prev.kind) && !retainedSet.has(prev.blockId)) {
      ops.push({ t: "restoreToken", token: prev, depth: depthOf.get(prev.blockId) ?? 0, afterBlockId: lastSurvivor });
      lastSurvivor = prev.blockId;
    } else if (retainedSet.has(prev.blockId)) {
      lastSurvivor = prev.blockId;
    }
  }

  // 6. Updates and inserts in document order.
  const lastChild = new Map<number, number>();
  const parentKey = (i: number): number => parentIdx[i] ?? -1;
  let i = 0;
  while (i < n) {
    const c = current[i]!;
    const id = retained[i];
    if (id !== null && id !== undefined) {
      if (!isToken(c.kind) && !isImage(c.kind)) {
        const pi = prevIndex.get(id);
        const prev = pi !== undefined ? previous[pi] : undefined;
        if (prev) {
          const kind = apiType(prev.kind) === apiType(c.kind) ? c.kind : prev.kind;
          if (!kindEquals(kind, prev.kind) || c.content !== prev.content) ops.push({ t: "update", blockId: id, kind, content: c.content });
        }
      }
      if (placed[i]) lastChild.set(parentKey(i), i);
      i++;
      continue;
    }
    if (isToken(c.kind)) { i++; continue; }

    const key = parentKey(i);
    const p = parentIdx[i]!;
    let parent: InsertParent;
    if (p !== null) {
      const rid = retained[p];
      parent = rid !== null && rid !== undefined ? { t: "block", id: rid } : { t: "pending", localId: current[p]!.localId };
    } else parent = { t: "page" };
    let position: InsertPosition;
    const j = lastChild.get(key);
    if (j !== undefined) {
      const rid = retained[j];
      position = rid !== null && rid !== undefined ? { t: "after", blockId: rid } : { t: "afterPending", localId: current[j]!.localId };
    } else position = { t: "start" };
    const batch: DocParagraph[] = [c];
    lastChild.set(key, i);
    i++;
    while (i < n && batch.length < maxBlocksPerAppend && retained[i] === null && !isToken(current[i]!.kind) && parentKey(i) === key) {
      batch.push(current[i]!);
      lastChild.set(key, i);
      i++;
    }
    ops.push({ t: "insert", parent, position, paragraphs: batch });
  }

  // 7. Deletes: only the top-most of a deleted subtree, never a subtree holding a token.
  const deleted = new Set(previous.filter((p) => !isToken(p.kind) && !retainedSet.has(p.blockId)).map((p) => p.blockId));
  const tokenAncestors = new Set<string>();
  const parentOf = new Map<string, string>();
  for (const p of previous) if (p.parentId !== null) parentOf.set(p.blockId, p.parentId);
  for (const p of previous) {
    if (!isToken(p.kind)) continue;
    let cursor: string | null = p.parentId;
    while (cursor !== null) { tokenAncestors.add(cursor); cursor = parentOf.get(cursor) ?? null; }
  }
  for (const prev of previous) {
    if (!deleted.has(prev.blockId)) continue;
    if (prev.parentId !== null && deleted.has(prev.parentId) && !tokenAncestors.has(prev.parentId)) continue;
    if (tokenAncestors.has(prev.blockId)) continue;
    ops.push({ t: "delete", blockId: prev.blockId });
  }
  return ops;
}
