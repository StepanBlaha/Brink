import type { ParagraphKind } from "./paragraphKind";

/**
 * Display numbers for numbered paragraphs: consecutive numbered items at one depth count up,
 * deeper items do not break the run, any other block at that depth or shallower restarts it.
 */
export function numbers(items: { kind: ParagraphKind; depth: number }[]): (number | null)[] {
  const counters = new Map<number, number>();
  return items.map((item) => {
    for (const k of [...counters.keys()]) if (k > item.depth) counters.delete(k);
    if (item.kind.t === "numbered") {
      const next = (counters.get(item.depth) ?? 0) + 1;
      counters.set(item.depth, next);
      return next;
    }
    counters.delete(item.depth);
    return null;
  });
}
