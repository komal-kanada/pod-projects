import type { Sql } from "@pod/db";
import { CONFIG, type SearchMode } from "../config";
import { searchChunks } from "../db/chunks";
import { hasFilters, relaxOnce } from "../metadata/validate";
import type { Candidate, QueryFilters } from "../types";

/**
 * One query against one run, with **soft** filters (06 §4): if a filtered
 * search returns fewer than `minFilteredResults`, the least reliable filter
 * is dropped and the search retried — contentTypes, then years, countries,
 * regions, chapter. A wrong inferred filter can narrow results, never empty
 * them. What the stricter search found stays on top, so a short section the
 * question names (an executive summary) still leads. Every relaxation is
 * recorded for the trace.
 */
export async function searchWithRelaxation(
  sql: Sql,
  args: { runId: string; query: string; embedding: number[]; mode: SearchMode; filters: QueryFilters; sectionIds?: string[] | null },
): Promise<{ candidates: Candidate[]; relaxed: string[]; appliedFilters: QueryFilters }> {
  let filters = args.filters;
  const relaxed: string[] = [];
  let kept: Candidate[] = [];

  while (true) {
    const found = await searchChunks(sql, { ...args, filters });
    const seen = new Set(kept.map((c) => c.chunkId));
    const candidates = [...kept, ...found.filter((c) => !seen.has(c.chunkId))];
    if (candidates.length >= CONFIG.retrieval.minFilteredResults || !hasFilters(filters)) {
      return { candidates, relaxed, appliedFilters: filters };
    }
    const next = relaxOnce(filters);
    if (!next) return { candidates, relaxed, appliedFilters: filters };
    relaxed.push(next.relaxed);
    filters = next.filters;
    kept = candidates;
  }
}
