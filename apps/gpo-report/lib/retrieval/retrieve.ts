import type { Embedder } from "@pod/ai";
import type { Sql } from "@pod/db";
import { RAG_CONFIG, type RetrievalMode } from "../config";
import { hybridSearch, vectorSearch } from "../db/chunks";
import type { IngestionRun, RetrievalResult } from "../types";

/**
 * The online retrieval entry point: embed the question, search the run.
 *
 * The question must be embedded with the same model and dimensions as the
 * run's chunks — vectors from different models live in different spaces and
 * their distances mean nothing. This is checked, and fails loudly.
 */
export class RetrievalConfigError extends Error {}

export async function retrieve(
  { sql, embedder }: { sql: Sql; embedder: Embedder },
  run: IngestionRun,
  question: string,
  { mode = RAG_CONFIG.retrieval.mode, topK = RAG_CONFIG.retrieval.topK }: { mode?: RetrievalMode; topK?: number } = {},
): Promise<RetrievalResult> {
  if (run.embeddingModel !== embedder.model || run.embeddingDims !== embedder.dimensions) {
    throw new RetrievalConfigError(
      `Run ${run.id.slice(0, 8)} was embedded with ${run.embeddingModel}/${run.embeddingDims}, but queries use ${embedder.model}/${embedder.dimensions}.`,
    );
  }

  const k = Math.min(Math.max(1, Math.round(topK)), RAG_CONFIG.retrieval.maxTopK);

  const embedStart = performance.now();
  const embedding = await embedder.embedQuery(question);
  const embeddingMs = performance.now() - embedStart;

  const searchStart = performance.now();
  let chunks =
    mode === "hybrid"
      ? await hybridSearch(sql, run.id, question, embedding, {
          topK: k,
          candidatePool: RAG_CONFIG.retrieval.candidatePool,
          rrfK: RAG_CONFIG.retrieval.rrfK,
        })
      : await vectorSearch(sql, run.id, embedding, k);
  const searchMs = performance.now() - searchStart;

  const minSimilarity = RAG_CONFIG.retrieval.minSimilarity;
  if (minSimilarity !== null) {
    chunks = chunks.filter((chunk) => chunk.similarity >= minSimilarity);
  }

  return { runId: run.id, mode, topK: k, embeddingMs, searchMs, chunks };
}
