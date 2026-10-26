/**
 * Reciprocal Rank Fusion: merges ranked lists without needing their scores to
 * be comparable (cosine similarity and ts_rank live on different scales).
 * Each item scores Σ 1 / (k + rank) over the lists it appears in, so things
 * ranked well by several lists rise. k = 60 is the value from the original
 * paper and works well without tuning.
 */
export function reciprocalRankFusion<T>(
  lists: T[][],
  key: (item: T) => string,
  k = 60,
): { item: T; score: number; ranks: (number | null)[] }[] {
  const fused = new Map<string, { item: T; score: number; ranks: (number | null)[] }>();

  lists.forEach((list, listIndex) => {
    list.forEach((item, index) => {
      const id = key(item);
      const entry =
        fused.get(id) ?? { item, score: 0, ranks: lists.map(() => null) };
      entry.score += 1 / (k + index + 1);
      entry.ranks[listIndex] = index + 1;
      fused.set(id, entry);
    });
  });

  return [...fused.values()].sort((a, b) => b.score - a.score);
}
