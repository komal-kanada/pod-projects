import type { Embedder, Gemini } from "@pod/ai";
import type { Sql } from "@pod/db";
import { reciprocalRankFusion } from "@pod/rag/rrf";
import { CONFIG, PRESETS, resolveStrategy, type PresetId } from "../config";
import { searchElements, variantVocab } from "../db/read";
import { expandQuery } from "../normalize/glossary";
import { normaliseForSearch } from "../normalize/units";
import type { ChunkHit, IngestionRun, RetrievalOutcome, RunKey, TraceStage } from "../types";
import { analyzeQuery, boostKinds } from "./analyze-query";
import { buildSources } from "./context";
import { diversify } from "./diversify";
import { expandHits } from "./expand";

/**
 * Runs the stages a preset enables, with a trace entry per stage:
 *   analyze ∥ embed → search × queries (hybrid, boosts, variant filter with
 *   fallback) → expand to elements → diversify → context (+ crops in M4)
 */
export class NotIngestedError extends Error {
  override name = "NotIngestedError";
}

const ms = (start: number) => Math.round(performance.now() - start);

export async function runRetrieval(
  deps: { sql: Sql; embedder: Embedder; gemini: Gemini },
  runs: Partial<Record<RunKey, IngestionRun>>,
  question: string,
  presetId: PresetId,
): Promise<RetrievalOutcome> {
  const preset = PRESETS[presetId];
  if (preset.visual) throw new NotIngestedError("M5 (visual retrieval) needs a multimodal embedding provider, which isn't set up.");
  const key = `${resolveStrategy(preset.strategy)}:${preset.representation}` as RunKey;
  const run = runs[key];
  if (!run) throw new NotIngestedError(`Preset ${presetId} needs an active ${key} run. Ingest it first.`);
  if (run.embeddingModel !== deps.embedder.model || run.embeddingDims !== deps.embedder.dimensions) {
    throw new Error(`Run ${run.id.slice(0, 8)} was embedded with ${run.embeddingModel}/${run.embeddingDims}; queries use ${deps.embedder.model}/${deps.embedder.dimensions}.`);
  }

  const trace: TraceStage[] = [];
  const tokens = { analysis: 0 };

  let start = performance.now();
  const vocab = preset.analyze ? await variantVocab(deps.sql, run.id) : [];
  const [analysis, rawEmbedding] = await Promise.all([
    preset.analyze ? analyzeQuery(deps.gemini, question, { variants: vocab, onUsage: (t) => (tokens.analysis += t) }) : Promise.resolve(null),
    deps.embedder.embedQuery(question),
  ]);
  if (analysis) {
    trace.push({
      stage: "analyze",
      ms: ms(start),
      summary: `${analysis.intent}${analysis.fallback ? " (fallback)" : ""}${analysis.targetTypes.length ? ` · ${analysis.targetTypes.join(", ")}` : ""}${analysis.variants.length ? ` · ${analysis.variants.join(", ")}` : ""}`,
      details: analysis,
    });
  }

  start = performance.now();
  const queries = analysis ? [analysis.rewrittenQuery, ...analysis.subQueries] : [question];
  const embeddings = analysis ? await deps.embedder.embedQueries(queries) : [rawEmbedding];
  const boosts = boostKinds(analysis);
  const lists: ChunkHit[][] = [];
  const perQuery: { q: string; hits: number; variantFallback: boolean }[] = [];

  for (let i = 0; i < queries.length; i += 1) {
    const keywordQuery = preset.search === "vector" ? queries[i] : expandQuery(normaliseForSearch(queries[i]));
    const args = { runId: run.id, query: keywordQuery, embedding: embeddings[i], mode: preset.search, boostKinds: boosts };
    let hits = await searchElements(deps.sql, { ...args, variants: analysis?.variants.length ? analysis.variants : null });
    let variantFallback = false;
    if (analysis?.variants.length && hits.length < CONFIG.retrieval.minFilteredResults) {
      hits = await searchElements(deps.sql, { ...args, variants: null });
      variantFallback = true;
    }
    lists.push(hits);
    perQuery.push({ q: keywordQuery, hits: hits.length, variantFallback });
  }
  const fused =
    lists.length === 1
      ? lists[0]
      : reciprocalRankFusion(lists, (h) => h.chunkId, CONFIG.retrieval.rrfK).map(({ item, score }) => ({ ...item, score }));
  trace.push({
    stage: "search",
    ms: ms(start),
    summary: `${preset.search} · ${queries.length} ${queries.length === 1 ? "query" : "queries"} · ${fused.length} chunks${boosts ? ` · boost ${boosts.join(", ")}` : ""}`,
    details: {
      perQuery,
      top: fused.slice(0, 15).map((h) => ({ kind: h.kind, page: h.page, vRank: h.vectorRank, kRank: h.keywordRank, score: Number(h.score.toFixed(4)), preview: h.content.slice(0, 120) })),
    },
  });

  start = performance.now();
  let ranked = preset.expand
    ? await expandHits(deps.sql, run.id, fused)
    : fused.map((hit) => ({ element: null, flat: hit, footnotes: [], score: hit.score, chunkIds: [hit.chunkId], hitRows: [] }));
  const limit = preset.expand ? CONFIG.retrieval.finalElements : 6;
  const { chosen, swapped } = diversify(ranked, limit, analysis?.targetTypes ?? []);
  ranked = chosen;
  trace.push({
    stage: preset.expand ? "expand" : "select",
    ms: ms(start),
    summary: `${ranked.length} ${preset.expand ? "elements" : "chunks"}${swapped ? ` · swapped in a ${swapped}` : ""}`,
    details: ranked.map((r) => ({ type: r.element?.type ?? "flat", page: r.element?.page ?? r.flat?.page, title: r.element?.title ?? null, score: Number(r.score.toFixed(4)), hitRows: r.hitRows, footnotes: r.footnotes.length })),
  });

  start = performance.now();
  const built = buildSources(ranked, { budget: CONFIG.retrieval.contextTokenBudget, maxImages: CONFIG.retrieval.maxImages, images: preset.images });
  trace.push({
    stage: "context",
    ms: ms(start),
    summary: `${built.sources.length} sources · ${(built.stats.tokens / 1000).toFixed(1)}k/${built.stats.budget / 1000}k tok${built.images.length ? ` · ${built.images.length} image${built.images.length > 1 ? "s" : ""}` : ""}${built.stats.dropped.length ? ` · ${built.stats.dropped.length} dropped` : ""}`,
    details: built.stats,
  });

  return { preset: presetId, runId: run.id, analysis, hits: fused, sources: built.sources, contextText: built.contextText, images: built.images, trace, tokens };
}
