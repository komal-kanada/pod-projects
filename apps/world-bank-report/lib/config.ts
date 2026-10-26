import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, GENERATION_MODEL } from "@pod/ai";

/**
 * Every tunable, and the presets B0–B6 — the ablation ladder. Each preset
 * adds one capability to the one before, so the eval can attribute every
 * gain (or loss) to a single technique (03 §Presets).
 */
export const DOCUMENT = {
  title: "World Bank Economic Report",
  filename: "world-bank-report.pdf",
  path: "data/world-bank-report.pdf",
  cacheDir: "data/cache",
  /** Hand-checked outline that replaces the PDF bookmarks (optional). */
  outlinePath: "data/outline.json",
};

export const SCHEMA = "worldbank";

export const RUN_KINDS = ["flat:text", "flat:markdown", "hierarchical"] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export type SearchMode = "vector" | "keyword" | "hybrid";

export interface Preset {
  label: string;
  run: RunKind;
  search: SearchMode;
  analyze: boolean;
  rerank: boolean;
  context: "raw" | "smallToBig";
  summaries: boolean;
  k: number;
}

export const PRESETS = {
  B0: { label: "Baseline", run: "flat:text", search: "vector", analyze: false, rerank: false, context: "raw", summaries: false, k: 6 },
  B1: { label: "+ structured parse", run: "flat:markdown", search: "vector", analyze: false, rerank: false, context: "raw", summaries: false, k: 6 },
  B2: { label: "+ hierarchical", run: "hierarchical", search: "vector", analyze: false, rerank: false, context: "smallToBig", summaries: false, k: 8 },
  B3: { label: "+ hybrid", run: "hierarchical", search: "hybrid", analyze: false, rerank: false, context: "smallToBig", summaries: false, k: 8 },
  B4: { label: "+ query analysis", run: "hierarchical", search: "hybrid", analyze: true, rerank: false, context: "smallToBig", summaries: false, k: 8 },
  B5: { label: "+ rerank", run: "hierarchical", search: "hybrid", analyze: true, rerank: true, context: "smallToBig", summaries: false, k: 8 },
  B6: { label: "+ summaries", run: "hierarchical", search: "hybrid", analyze: true, rerank: true, context: "smallToBig", summaries: true, k: 8 },
} as const satisfies Record<string, Preset>;

export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
/** Updated to the eval winner in Phase 9. */
export const DEFAULT_PRESET: PresetId = "B5";

export const CONFIG = {
  parse: {
    model: GENERATION_MODEL,
    // 15 pages a request keeps the whole report within one model's 20 a day;
    // one batch at a time, since parallel batches only multiply free-tier retries.
    pagesPerBatch: 15,
    concurrency: 1,
    /** Fidelity thresholds (04 §4). */
    minNumericPrecision: 0.98,
    minCoverage: 0.9,
  },
  chunk: {
    flat: { targetChars: 3200, overlapChars: 400 },
    child: { targetChars: 1600, maxChars: 2400 },
    tableMaxChars: 6000,
    /** Sections with these titles stay in the tree but are not retrieved. */
    excludeTitles: /^(summary of |table of )?contents$|^abbreviations|^acronyms|^references$|^bibliography$/i,
  },
  // 20 chunks (~16k tokens) per request: the free embedding tier allows 30k tokens a minute,
  // and 50 full-size chunks (~40k) can never fit inside it.
  embedding: { model: EMBEDDING_MODEL, dims: EMBEDDING_DIMENSIONS, batchSize: 20 },
  retrieval: {
    candidatePool: 30,
    rrfK: 60,
    minFilteredResults: 5,
    maxSubQueries: 3,
    summaryRouteTopSections: 4,
    parentMaxTokens: 2000,
    contextTokenBudget: 12000,
    rerankMinScore: 3,
    rerankPreviewChars: 600,
    /**
     * Web requests only — Vercel stops a function at 60s, and free-tier retries
     * can eat that. Past `analyzeMs` the question is used as asked; past
     * `rerankMs` the fused order is kept; past `totalMs` the answer stops with
     * a clear error. The CLI and eval wait as long as they need.
     */
    appBudget: { analyzeMs: 8_000, rerankMs: 12_000, totalMs: 55_000 },
  },
  generation: { model: GENERATION_MODEL, temperature: 0.2, maxOutputTokens: 1536 },
};
