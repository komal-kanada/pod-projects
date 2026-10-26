import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, GENERATION_MODEL } from "@pod/ai";

/**
 * Tunables, extraction strategies X0–X3 and QA presets M0–M5 (03 §Presets).
 * Each preset adds one capability, so the eval can attribute every change.
 */
export const DOCUMENT = {
  title: "Apple iMac Environmental Report",
  filename: "imac-environmental-report.pdf",
  path: "data/imac-environmental-report.pdf",
  cacheDir: "data/cache",
  publicDir: "public/report",
};

export const SCHEMA = "imac";

export const STRATEGIES = {
  X0: "Text layer only (heuristic structure)",
  X1: "Gemini reads each page image → elements with boxes",
  X2: "X1 + a focused high-resolution pass on every table and chart",
  X3: "X2 with a stronger model (set X3_MODEL)",
} as const;
export type StrategyId = keyof typeof STRATEGIES;
export const STRATEGY_IDS = Object.keys(STRATEGIES) as StrategyId[];

export type Representation = "flat" | "typed";
export type SearchMode = "vector" | "keyword" | "hybrid";

export interface Preset {
  label: string;
  /** "BEST" = the strategy chosen from the extraction eval. */
  strategy: StrategyId | "BEST";
  representation: Representation;
  search: SearchMode;
  analyze: boolean;
  expand: boolean;
  images: boolean;
  visual: boolean;
}

export const PRESETS = {
  M0: { label: "Baseline: text layer", strategy: "X0", representation: "flat", search: "vector", analyze: false, expand: false, images: false, visual: false },
  M1: { label: "+ page elements", strategy: "X1", representation: "flat", search: "vector", analyze: false, expand: false, images: false, visual: false },
  M2: { label: "+ typed representations", strategy: "BEST", representation: "typed", search: "vector", analyze: false, expand: true, images: false, visual: false },
  M3: { label: "+ hybrid & type-aware", strategy: "BEST", representation: "typed", search: "hybrid", analyze: true, expand: true, images: false, visual: false },
  M4: { label: "+ image crops in context", strategy: "BEST", representation: "typed", search: "hybrid", analyze: true, expand: true, images: true, visual: false },
  M5: { label: "+ visual retrieval (stretch)", strategy: "BEST", representation: "typed", search: "hybrid", analyze: true, expand: true, images: true, visual: true },
} as const satisfies Record<string, Preset>;

export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
/** Updated to the ablation winner in Phase 8. */
export const DEFAULT_PRESET: PresetId = "M4";

export const CONFIG = {
  extraction: {
    /** Set from the extraction eval (Phase 2). */
    chosen: "X2" as StrategyId,
    model: GENERATION_MODEL,
    renderDpi: 170,
    focusDpi: 300,
    cropPadding: 0.04,
    // One page at a time: free-tier keys allow 5 requests a minute, and parallel
    // pages only multiply the retries a busy spell burns from the daily quota.
    concurrency: 1,
  },
  chunk: { textTargetChars: 1200, flatTargetChars: 1600, flatOverlapChars: 200, wideTableColumns: 8 },
  embedding: { model: EMBEDDING_MODEL, dims: EMBEDDING_DIMENSIONS, batchSize: 50 },
  retrieval: {
    candidatePool: 30,
    finalElements: 6,
    typeBoost: 0.004,
    maxImages: 3,
    contextTokenBudget: 8000,
    rrfK: 60,
    minFilteredResults: 3,
    maxSubQueries: 3,
  },
  generation: { model: GENERATION_MODEL, temperature: 0.2, maxOutputTokens: 1536 },
};

export function resolveStrategy(strategy: StrategyId | "BEST"): StrategyId {
  return strategy === "BEST" ? CONFIG.extraction.chosen : strategy;
}
