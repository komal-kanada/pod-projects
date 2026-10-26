import type { PresetId, RunKind, SearchMode } from "./config";

/**
 * Shared shapes for the pipeline, API and UI. Client components import from
 * here, so this file must stay free of server-only imports.
 */

// ── Parsing ─────────────────────────────────────────────────────────────────

export interface Footnote {
  n: string;
  text: string;
}

/** A typed piece of a page, from Gemini markdown (or the text layer). */
export type Block =
  | { kind: "heading"; level: number; text: string; page: number }
  | { kind: "paragraph"; text: string; page: number; pageEnd?: number; footnotes?: Footnote[] }
  | { kind: "list"; items: string[]; page: number; footnotes?: Footnote[] }
  | { kind: "table"; caption?: string; markdown: string; header: string[]; rowLabels: string[]; rows: number; page: number; pageEnd?: number; notes?: string; footnotes?: Footnote[] }
  | { kind: "figure"; title: string; description: string; page: number; source?: string }
  | { kind: "box"; title: string; blocks: Block[]; page: number; pageEnd?: number }
  | { kind: "footnote"; n: string; text: string; page: number };

export type ParseSource = "gemini" | "text_layer";

/** Everything `pnpm parse` produces and ingestion consumes. */
export interface ParsedReport {
  sha256: string;
  pageCount: number;
  pageLabels: string[];
  outline: { title: string; pageNumber: number | null; level: number }[];
  /** Cleaned text layer per page (index 0 = page 1). */
  textPages: string[];
  /** Gemini markdown per page, or null where it fell back to the text layer. */
  markdownPages: (string | null)[];
  parseSource: ParseSource[];
}

// ── Structure ───────────────────────────────────────────────────────────────

export type SectionKind = "report" | "front_matter" | "chapter" | "section" | "box" | "appendix" | "references";

export interface SectionNode {
  key: string;
  title: string;
  level: number;
  ordinal: number;
  path: string[];
  kind: SectionKind;
  pageStart: number;
  pageEnd: number;
  blocks: Block[];
  children: SectionNode[];
  regions: string[];
  retrievable: boolean;
  ownTokenCount: number;
  tokenCount: number;
}

// ── Chunks ──────────────────────────────────────────────────────────────────

export type ContentType = "flat" | "text" | "table" | "figure" | "box" | "summary";

export interface ChunkMetadata {
  regions: string[];
  countries: string[];
  years: number[];
  isForecast: boolean;
}

export interface PreparedChunk extends ChunkMetadata {
  index: number;
  sectionKey: string | null;
  ordinalInSection: number | null;
  contentType: ContentType;
  title: string | null;
  content: string;
  embedText: string;
  sectionPath: string[];
  chapter: string | null;
  pageStart: number;
  pageEnd: number;
  pageLabelStart: string;
  pageLabelEnd: string;
  parseSource: ParseSource;
  tokenCount: number;
}

export interface IngestionRun {
  id: string;
  documentId: string;
  kind: RunKind;
  configHash: string;
  config: Record<string, unknown>;
  embeddingModel: string;
  embeddingDims: number;
  status: "running" | "completed" | "failed";
  stats: Record<string, unknown> | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
}

// ── Retrieval ───────────────────────────────────────────────────────────────

export interface QueryFilters {
  regions?: string[];
  countries?: string[];
  years?: number[];
  contentTypes?: ("table" | "figure" | "box" | "text")[];
  chapter?: string;
}

export type Intent = "fact" | "numeric" | "comparison" | "summary" | "explanation" | "out_of_scope";

export interface QueryAnalysis {
  intent: Intent;
  rewrittenQuery: string;
  subQueries: string[];
  filters: QueryFilters;
  wantsForecast?: boolean;
  /** Filter values the model proposed that failed validation. */
  dropped?: string[];
  fallback?: boolean;
}

export interface Candidate {
  chunkId: string;
  sectionId: string | null;
  contentType: ContentType;
  title: string | null;
  content: string;
  sectionPath: string[];
  chapter: string | null;
  pageStart: number;
  pageEnd: number;
  pageLabelStart: string | null;
  pageLabelEnd: string | null;
  regions: string[];
  countries: string[];
  years: number[];
  isForecast: boolean;
  tokenCount: number;
  ordinalInSection: number | null;
  similarity: number | null;
  vectorRank: number | null;
  keywordRank: number | null;
  /** Fusion score (or rerank score once reranked). */
  score: number;
  rerankScore?: number | null;
  /** Which (sub-)query found it. */
  queryIndex?: number;
}

export interface TraceStage {
  stage: string;
  ms: number;
  summary: string;
  details?: unknown;
}

/** One numbered block of assembled context — what `[n]` refers to. */
export interface ContextSource {
  n: number;
  sectionId: string | null;
  sectionPath: string[];
  contentType: ContentType;
  title: string | null;
  pageStart: number;
  pageEnd: number;
  pageLabel: string;
  tokens: number;
  chunkIds: string[];
  score: number;
  text: string;
}

export interface RetrievalOutcome {
  preset: PresetId;
  runIds: string[];
  analysis: QueryAnalysis | null;
  candidates: Candidate[];
  final: Candidate[];
  sources: ContextSource[];
  context: string;
  trace: TraceStage[];
  tokens: { analysis: number; rerank: number };
}

export type AskEvent =
  | { type: "analysis"; analysis: QueryAnalysis }
  | { type: "sources"; preset: PresetId; sources: ContextSource[] }
  | { type: "trace"; trace: TraceStage[] }
  | { type: "token"; text: string }
  | {
      type: "done";
      latencyMs: number;
      firstTokenMs: number | null;
      citations: number[];
      invalidCitations: number[];
      refused: boolean;
      contextTokens: number;
      queryId: string | null;
    }
  | { type: "error"; message: string; retryable: boolean; code?: string };

export type { PresetId, RunKind, SearchMode };

export function pageLabel(start: string | number | null, end: string | number | null): string {
  const a = start ?? "?";
  const b = end ?? a;
  return a === b ? `p. ${a}` : `p. ${a}–${b}`;
}

export const PATH_SEPARATOR = " › ";
