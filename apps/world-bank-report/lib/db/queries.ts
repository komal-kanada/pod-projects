import type { Sql } from "@pod/db";
import type { ContextSource, QueryAnalysis, TraceStage } from "../types";

/** The query log, with the full trace. Never breaks an answer. */
export async function logQuery(
  sql: Sql,
  entry: {
    question: string;
    preset: string;
    runIds: string[];
    analysis: QueryAnalysis | null;
    trace: TraceStage[];
    sources: ContextSource[];
    answer: string | null;
    citations: number[];
    invalidCitations: number[];
    tokens: unknown;
    latencyMs: number;
    firstTokenMs: number | null;
    error: string | null;
    source: "app" | "cli" | "eval";
  },
): Promise<string | null> {
  try {
    const sources = entry.sources.map(({ n, sectionId, chunkIds, pageStart, pageEnd, contentType, tokens }) => ({
      n, sectionId, chunkIds, pages: [pageStart, pageEnd], type: contentType, tokens,
    }));
    const [row] = await sql<{ id: string }[]>`
      insert into worldbank.queries (question, preset, run_ids, analysis, trace, context_sources, answer, citations,
        invalid_citations, tokens, latency_ms, first_token_ms, error, source)
      values (${entry.question}, ${entry.preset}, ${entry.runIds}::uuid[], ${entry.analysis ? sql.json(entry.analysis as never) : null},
        ${sql.json(entry.trace as never)}, ${sql.json(sources as never)}, ${entry.answer}, ${entry.citations}::int[],
        ${entry.invalidCitations}::int[], ${sql.json((entry.tokens ?? {}) as never)}, ${Math.round(entry.latencyMs)},
        ${entry.firstTokenMs === null ? null : Math.round(entry.firstTokenMs)}, ${entry.error}, ${entry.source})
      returning id
    `;
    return row.id;
  } catch (error) {
    console.error("[worldbank] query log failed:", error);
    return null;
  }
}
