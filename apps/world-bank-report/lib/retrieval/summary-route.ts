import type { Sql } from "@pod/db";
import { CONFIG } from "../config";
import { matchSummaries } from "../db/chunks";
import { sectionDescendants } from "../db/sections";

/**
 * Summary routing (B6, 06 §3): for broad questions, the closest section
 * summaries pick the sections to look in. The search then runs both inside
 * those sections and unrestricted, fused — so a bad route can't hide the
 * right answer.
 */
export async function routeBySummaries(sql: Sql, runId: string, embedding: number[]) {
  const matches = await matchSummaries(sql, runId, embedding, CONFIG.retrieval.summaryRouteTopSections);
  const roots = [...new Set(matches.map((m) => m.section_id))];
  const sectionIds = await sectionDescendants(sql, roots);
  return {
    sectionIds,
    routed: matches.map((m) => ({ path: m.path, similarity: Number(Number(m.similarity).toFixed(3)) })),
  };
}
