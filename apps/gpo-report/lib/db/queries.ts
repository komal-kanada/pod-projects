import type { Sql } from "@pod/db";
import type { RetrievedChunk } from "../types";

/**
 * The query log: every question asked, with what was retrieved and answered.
 * It is the raw material for spotting failures outside the gold set.
 * Logging never breaks an answer — failures here are swallowed and reported.
 */
export async function logQuery(
  sql: Sql,
  entry: {
    runId: string | null;
    question: string;
    mode: string;
    topK: number;
    retrieved: RetrievedChunk[];
    answer: string | null;
    citations: number[];
    invalidCitations: number[];
    generationModel: string;
    latencyMs: number;
    firstTokenMs: number | null;
    error: string | null;
    source: "app" | "cli" | "eval";
  },
): Promise<string | null> {
  try {
    const retrieved = entry.retrieved.map((chunk) => ({
      chunkId: chunk.chunkId,
      rank: chunk.rank,
      similarity: Number(chunk.similarity.toFixed(4)),
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
    }));
    const [row] = await sql<{ id: string }[]>`
      insert into gpo.queries (
        run_id, question, retrieval_mode, top_k, retrieved, answer, citations, invalid_citations,
        generation_model, latency_ms, first_token_ms, error, source
      ) values (
        ${entry.runId}, ${entry.question}, ${entry.mode}, ${entry.topK}, ${sql.json(retrieved)},
        ${entry.answer}, ${entry.citations}::int[], ${entry.invalidCitations}::int[],
        ${entry.generationModel}, ${Math.round(entry.latencyMs)}, ${entry.firstTokenMs === null ? null : Math.round(entry.firstTokenMs)},
        ${entry.error}, ${entry.source}
      )
      returning id
    `;
    return row.id;
  } catch (error) {
    console.error("[gpo] query log failed:", error);
    return null;
  }
}
