import { reciprocalRankFusion } from "@pod/rag/rrf";
import type { Candidate } from "../types";

/**
 * Merging candidate lists from several (sub-)queries. Fusion is RRF; then
 * **quotas** make sure every sub-query keeps at least ⌊k / n⌋ slots, so a
 * comparison of two regions always has evidence for both sides (06 §4).
 */
export interface Pooled extends Candidate {
  /** Indexes of the queries that retrieved this chunk. */
  queries: number[];
  fused: number;
}

export function fuseLists(lists: Candidate[][], rrfK = 60): Pooled[] {
  if (lists.length === 1) {
    return lists[0].map((c) => ({ ...c, queries: [0], fused: c.score }));
  }
  return reciprocalRankFusion(lists, (c) => c.chunkId, rrfK).map(({ item, score, ranks }) => ({
    ...item,
    queries: ranks.flatMap((rank, i) => (rank === null ? [] : [i])),
    fused: score,
  }));
}

/** Top k by `score`, guaranteeing each query its quota where it has candidates. */
export function selectWithQuotas<T extends { chunkId: string; queries: number[] }>(
  ranked: T[],
  k: number,
  queryCount: number,
): T[] {
  if (queryCount <= 1) return ranked.slice(0, k);
  const quota = Math.floor(k / queryCount);
  const chosen = new Map<string, T>();
  for (let q = 0; q < queryCount; q += 1) {
    ranked.filter((c) => c.queries.includes(q)).slice(0, quota).forEach((c) => chosen.set(c.chunkId, c));
  }
  for (const candidate of ranked) {
    if (chosen.size >= k) break;
    chosen.set(candidate.chunkId, candidate);
  }
  // Keep the caller's ranking order.
  return ranked.filter((c) => chosen.has(c.chunkId)).slice(0, Math.max(k, chosen.size));
}
