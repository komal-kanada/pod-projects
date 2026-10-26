import type { Sql } from "@pod/db";
import type { ElementSource, QueryAnalysis, TraceStage } from "../types";

/** The query log, including model-reported image/extraction disagreements. */
export async function logQuery(
  sql: Sql,
  entry: {
    question: string;
    preset: string;
    runId: string | null;
    analysis: QueryAnalysis | null;
    trace: TraceStage[];
    sources: ElementSource[];
    answer: string | null;
    citations: number[];
    invalidCitations: number[];
    disagreements: number[];
    tokens: unknown;
    latencyMs: number;
    firstTokenMs: number | null;
    error: string | null;
    source: "app" | "cli" | "eval";
  },
): Promise<string | null> {
  try {
    const sources = entry.sources.map((s) => ({ n: s.n, elementId: s.elementId, type: s.type, page: s.page, title: s.title, images: s.imageAttached }));
    const [row] = await sql<{ id: string }[]>`
      insert into imac.queries (question, preset, run_id, analysis, trace, sources, answer, citations, invalid_citations,
        disagreements, tokens, latency_ms, first_token_ms, error, source)
      values (${entry.question}, ${entry.preset}, ${entry.runId}, ${entry.analysis ? sql.json(entry.analysis as never) : null},
        ${sql.json(entry.trace as never)}, ${sql.json(sources as never)}, ${entry.answer}, ${entry.citations}::int[],
        ${entry.invalidCitations}::int[], ${entry.disagreements.length ? entry.disagreements.join(",") : null},
        ${sql.json((entry.tokens ?? {}) as never)}, ${Math.round(entry.latencyMs)},
        ${entry.firstTokenMs === null ? null : Math.round(entry.firstTokenMs)}, ${entry.error}, ${entry.source})
      returning id
    `;
    return row.id;
  } catch (error) {
    console.error("[imac] query log failed:", error);
    return null;
  }
}
