import type { RetrievalMode } from "./config";

/**
 * Shared shapes. Client components import from here too, so this file must
 * stay free of server-only imports.
 */

/** A paragraph after parsing, cleaning and structure detection. */
export interface Paragraph {
  text: string;
  pageNumber: number;
  /** ["Financial Highlights", "Revenue"]; empty before the first heading. */
  sectionPath: string[];
}

/** A chunk ready to embed and store. */
export interface PreparedChunk {
  index: number;
  content: string;
  embedText: string;
  sectionPath: string;
  pageStart: number;
  pageEnd: number;
  pageLabelStart: string;
  pageLabelEnd: string;
}

export interface IngestionRun {
  id: string;
  documentId: string;
  configHash: string;
  config: unknown;
  embeddingModel: string;
  embeddingDims: number;
  status: "running" | "completed" | "failed";
  chunkCount: number | null;
  stats: Record<string, unknown> | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** A chunk as returned by retrieval, in rank order. */
export interface RetrievedChunk {
  rank: number;
  chunkId: string;
  chunkIndex: number;
  content: string;
  sectionPath: string | null;
  pageStart: number;
  pageEnd: number;
  pageLabelStart: string | null;
  pageLabelEnd: string | null;
  similarity: number;
  vectorRank?: number | null;
  keywordRank?: number | null;
  rrfScore?: number | null;
}

export interface RetrievalResult {
  runId: string;
  mode: RetrievalMode;
  topK: number;
  embeddingMs: number;
  searchMs: number;
  chunks: RetrievedChunk[];
}

/** One numbered source in an answer — what `[n]` refers to. */
export interface AnswerSource {
  n: number;
  chunkId: string;
  pageStart: number;
  pageEnd: number;
  pageLabel: string;
  section: string | null;
  similarity: number;
  content: string;
}

/** Events streamed by POST /api/ask, one JSON object per line. */
export type AskEvent =
  | { type: "sources"; runId: string; mode: RetrievalMode; sources: AnswerSource[] }
  | { type: "token"; text: string }
  | {
      type: "done";
      latencyMs: number;
      firstTokenMs: number | null;
      citations: number[];
      invalidCitations: number[];
      refused: boolean;
      queryId: string | null;
    }
  | { type: "error"; message: string; retryable: boolean; code?: string };

/** "p. 12" or "p. 12–13", using printed labels when the PDF has them. */
export function pageLabel(start: string | number | null, end: string | number | null): string {
  const a = start ?? "?";
  const b = end ?? a;
  return a === b ? `p. ${a}` : `p. ${a}–${b}`;
}
