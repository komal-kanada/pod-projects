import type { PresetId, Representation, StrategyId } from "./config";

/**
 * The element model (04 §2): the unit of the document is the element —
 * heading, text, table, chart, footnote, callout, image — not the paragraph.
 * Client components import from here, so no server-only imports.
 */

/** [ymin, xmin, ymax, xmax], normalised 0–1000 (Gemini's native box_2d). */
export type BBox = [number, number, number, number];

export interface ChartPoint {
  label: string;
  value: number | null;
  valueText: string;
  /** "labelled" only if the number is printed on the chart. */
  valueSource: "labelled" | "estimated";
}

export interface ChartSeries {
  name: string;
  points: ChartPoint[];
}

export interface Fidelity {
  checked: boolean;
  numericPrecision: number | null;
  flags: string[];
}

interface ElementBase {
  /** Stable within a strategy: "X2-p03-e07". */
  key: string;
  page: number;
  bbox: BBox | null;
  order: number;
  section?: string;
  /** Footnote markers this element references. */
  footnoteRefs: string[];
  fidelity?: Fidelity;
  overridden?: boolean;
}

export type Element = ElementBase &
  (
    | { type: "heading"; level: number; text: string }
    | { type: "text"; text: string }
    | { type: "table"; title?: string; columns: string[]; rows: string[][]; rowHeaderCols: number; unit?: string; notes?: string; markdown: string }
    | {
        type: "chart";
        chartType: "bar" | "stacked_bar" | "pie" | "donut" | "line" | "other";
        title?: string;
        unit?: string;
        xLabel?: string;
        yLabel?: string;
        series: ChartSeries[];
        description: string;
      }
    | { type: "footnote"; marker: string; text: string }
    | { type: "callout"; text: string; figure?: string; iconMeaning?: string }
    | { type: "image"; description: string }
  );

export type ElementType = Element["type"];

// ── Rendering ───────────────────────────────────────────────────────────────

export interface TextLine {
  text: string;
  /** Normalised 0–1000. */
  bbox: BBox;
  size: number;
  /** Smaller than body text and raised: a footnote marker. */
  superscript: boolean;
}

export interface RenderedPage {
  page: number;
  imagePath: string;
  width: number;
  height: number;
  /** sha256 of the PNG — part of every extraction cache key. */
  imageHash: string;
  lines: TextLine[];
  text: string;
  bodySize: number;
}

// ── Chunks ──────────────────────────────────────────────────────────────────

export type ChunkKind =
  | "flat" | "text" | "table_summary" | "table_row" | "chart_summary" | "chart_fact" | "footnote" | "callout" | "image";

export interface DerivedChunk {
  elementKey: string | null;
  kind: ChunkKind;
  elementType: ElementType | null;
  content: string;
  embedText: string;
  ftsText: string;
  page: number;
  section: string | null;
  variants: string[];
  phases: string[];
  units: string[];
  hasNumbers: boolean;
  ordinal: number;
}

export interface FootnoteLink {
  elementKey: string;
  footnoteKey: string;
  marker: string;
}

export interface IngestionRun {
  id: string;
  strategy: StrategyId;
  representation: Representation;
  config: Record<string, unknown>;
  embeddingModel: string;
  embeddingDims: number;
  status: "running" | "completed" | "failed";
  stats: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
}

export type RunKey = `${StrategyId}:${Representation}`;

// ── Retrieval ───────────────────────────────────────────────────────────────

export type Intent = "numeric" | "explanation" | "comparison" | "methodology" | "yes_no" | "out_of_scope";
export type TargetType = "text" | "table" | "chart" | "footnote" | "callout";

export interface QueryAnalysis {
  intent: Intent;
  targetTypes: TargetType[];
  variants: string[];
  phases: string[];
  rewrittenQuery: string;
  subQueries: string[];
  dropped?: string[];
  fallback?: boolean;
}

export interface ChunkHit {
  chunkId: string;
  elementId: string | null;
  kind: ChunkKind;
  elementType: ElementType | null;
  content: string;
  page: number;
  section: string | null;
  variants: string[];
  similarity: number | null;
  vectorRank: number | null;
  keywordRank: number | null;
  score: number;
}

export interface StoredElement {
  id: string;
  key: string;
  page: number;
  order: number;
  type: ElementType;
  bbox: BBox | null;
  cropPath: string | null;
  title: string | null;
  section: string | null;
  text: string | null;
  data: Record<string, unknown> | null;
  markdown: string | null;
  marker: string | null;
  fidelity?: Fidelity | null;
  overridden?: boolean;
}

export interface LinkedFootnote {
  id: string;
  marker: string;
  text: string;
  page: number;
}

/** One numbered source — what `[n]` refers to: a whole element. */
export interface ElementSource {
  n: number;
  elementId: string | null;
  type: ElementType | "flat";
  page: number;
  title: string | null;
  section: string | null;
  text: string;
  tokens: number;
  /** For tables: rows the search hit (0-based body row index). */
  hitRows: number[];
  data: Record<string, unknown> | null;
  footnotes: LinkedFootnote[];
  cropPath: string | null;
  imageAttached: boolean;
  referencedBy?: string | null;
  chunkIds: string[];
  score: number;
}

export interface TraceStage {
  stage: string;
  ms: number;
  summary: string;
  details?: unknown;
}

export interface RetrievalOutcome {
  preset: PresetId;
  runId: string;
  analysis: QueryAnalysis | null;
  hits: ChunkHit[];
  sources: ElementSource[];
  contextText: string;
  images: { n: number; path: string }[];
  trace: TraceStage[];
  tokens: { analysis: number };
}

export type AskEvent =
  | { type: "analysis"; analysis: QueryAnalysis }
  | { type: "sources"; preset: PresetId; sources: ElementSource[] }
  | { type: "trace"; trace: TraceStage[] }
  | { type: "token"; text: string }
  | {
      type: "done";
      latencyMs: number;
      firstTokenMs: number | null;
      citations: number[];
      invalidCitations: number[];
      refused: boolean;
      disagreements: number[];
      images: number;
      queryId: string | null;
    }
  | { type: "error"; message: string; retryable: boolean; code?: string };

export type { PresetId, Representation, StrategyId };
