import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, GENERATION_MODEL } from "@pod/ai";

/**
 * Every number that affects results lives here, and the active values are
 * written into each ingestion run and each eval result — so a score can
 * always be traced back to the exact configuration that produced it.
 */
export const DOCUMENT = {
  title: "GPO Annual Report",
  filename: "gpo-annual-report.pdf",
  /** Relative to the app root. */
  path: "data/gpo-annual-report.pdf",
  /** Hand-written outline for pages the PDF's bookmarks miss (see lib/ingest/structure.ts). */
  outlineSupplementPath: "data/outline-supplement.json",
};

export const SCHEMA = "gpo";

export type RetrievalMode = "vector" | "hybrid";

export const RAG_CONFIG = {
  chunk: {
    /** ~800 tokens: a full paragraph plus its figures, still precise to retrieve. */
    targetChars: 3200,
    /** ~12 %: stops an answer being cut at a chunk seam. */
    overlapChars: 400,
    /** Fragments shorter than this merge into a neighbour. */
    minChars: 200,
    /** Embed "title | section | pages" above the text (experiment E3). */
    contextualHeader: true,
  },
  embedding: {
    model: EMBEDDING_MODEL,
    dims: EMBEDDING_DIMENSIONS,
    batchSize: 50,
  },
  retrieval: {
    mode: "vector" as RetrievalMode,
    topK: 6,
    maxTopK: 12,
    /** Per-list depth before Reciprocal Rank Fusion (hybrid only). */
    candidatePool: 20,
    rrfK: 60,
    /** Off until calibrated from eval data (03 §7). */
    minSimilarity: null as number | null,
  },
  generation: {
    model: GENERATION_MODEL,
    temperature: 0.2,
    maxOutputTokens: 1024,
  },
  judge: { model: GENERATION_MODEL, temperature: 0 },
};

export type ChunkConfig = typeof RAG_CONFIG.chunk;

/** What identifies an ingestion run: how it was chunked and embedded. */
export function ingestionConfig(chunk: ChunkConfig = RAG_CONFIG.chunk) {
  return { chunk, embedding: RAG_CONFIG.embedding };
}
