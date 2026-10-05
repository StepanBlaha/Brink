/**
 * Indices (into `values`) of a strictly increasing subsequence with the largest total weight
 * (ties: the earliest found). O(n^2): groups are one parent's children.
 */
export function heaviestIncreasingSubsequence(values: number[], weights: number[]): number[] {
  if (values.length === 0) return [];
  const best = [...weights];
  const prev = values.map(() => -1);
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < i; j++) {
      if (values[j]! < values[i]! && best[j]! + weights[i]! > best[i]!) {
        best[i] = best[j]! + weights[i]!;
        prev[i] = j;
      }
    }
  }
  // Swift: max(by: best[a] < best[b] || (equal && a > b)) keeps the earliest index among ties.
  let k = 0;
  for (let i = 1; i < best.length; i++) if (best[i]! > best[k]!) k = i;
  const result: number[] = [];
  while (k >= 0) { result.push(k); k = prev[k]!; }
  return result.reverse();
}
