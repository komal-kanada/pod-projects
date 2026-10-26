/**
 * Retrieval and summary metrics shared by every POD eval.
 *
 * All retrieval metrics take a ranked list of booleans/grades ("did the item
 * at this rank hit?") so each app decides what a hit means — overlapping
 * pages for GPO, section prefixes for World Bank, elements for iMac — and the
 * maths stays in one tested place.
 */

/** 1 if any of the first k ranks hit. */
export function hitAtK(hits: boolean[], k: number): number {
  return hits.slice(0, k).some(Boolean) ? 1 : 0;
}

/** 1 / rank of the first hit, 0 if nothing hit. */
export function reciprocalRank(hits: boolean[]): number {
  const index = hits.findIndex(Boolean);
  return index === -1 ? 0 : 1 / (index + 1);
}

/** Fraction of the expected targets covered by the first k results. */
export function recallAtK<T>(
  ranked: T[][],
  expected: T[],
  k: number,
): number {
  if (expected.length === 0) return 0;
  const covered = new Set(ranked.slice(0, k).flat());
  return expected.filter((target) => covered.has(target)).length / expected.length;
}

/** nDCG@k with graded relevance (e.g. page hit = 2, section-only = 1). */
export function ndcgAtK(grades: number[], k: number): number {
  const dcg = (values: number[]) =>
    values.slice(0, k).reduce((sum, grade, i) => sum + (2 ** grade - 1) / Math.log2(i + 2), 0);
  const ideal = dcg([...grades].sort((a, b) => b - a));
  return ideal === 0 ? 0 : dcg(grades) / ideal;
}

export function mean(values: number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

/** Nearest-rank percentile (p in 0–100). */
export function percentile(values: number[], p: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/** Pages covered by a page range, inclusive. */
export function pageRange(start: number, end: number): number[] {
  const pages: number[] = [];
  for (let page = start; page <= Math.max(start, end); page += 1) pages.push(page);
  return pages;
}

export function overlaps(start: number, end: number, pages: number[]): boolean {
  return pages.some((page) => page >= start && page <= end);
}
