import type { Embedder, Gemini } from "@pod/ai";
import type { Sql } from "@pod/db";
import { CONFIG, PRESETS, type PresetId, type RunKind } from "../config";
import { sectionChildren } from "../db/chunks";
import { chapterTitles, sectionInfo } from "../db/sections";
import type { Candidate, IngestionRun, QueryAnalysis, QueryFilters, RetrievalOutcome, TraceStage } from "../types";
import { PATH_SEPARATOR } from "../types";
import { analyzeQuery, fallbackAnalysis } from "./analyze-query";
import { assembleContext, type RankedCandidate } from "./context";
import { fuseLists, selectWithQuotas, type Pooled } from "./fusion";
import { rerank } from "./rerank";
import { searchWithRelaxation } from "./search";
import { routeBySummaries } from "./summary-route";

/**
 * Runs the retrieval stages a preset enables (03 §Presets) and records a
 * trace entry for each: what went in, what came out, how long it took.
 *
 *   analyze ∥ embed → (route) → search × queries → fuse → (rerank) → context
 */
export class NotIngestedError extends Error {
  override name = "NotIngestedError";
}

export interface RetrievalDeps {
  sql: Sql;
  embedder: Embedder;
  gemini: Gemini;
}

/** Time limits for the optional model stages; unset means wait as long as it takes. */
export interface StageBudget {
  analyzeMs?: number;
  rerankMs?: number;
}

/**
 * Runs `task` with an abort signal. Past `ms` the signal fires and `fallback`
 * is returned at once, without waiting for any retries inside to unwind.
 */
async function withinBudget<T>(ms: number | undefined, task: (signal?: AbortSignal) => Promise<T>, fallback: () => T): Promise<T> {
  if (!ms) return task();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(fallback());
    }, ms);
  });
  try {
    return await Promise.race([task(controller.signal), late]);
  } finally {
    clearTimeout(timer);
  }
}

const elapsed = (start: number) => Math.round(performance.now() - start);

export async function runRetrieval(
  deps: RetrievalDeps,
  runs: Partial<Record<RunKind, IngestionRun>>,
  question: string,
  presetId: PresetId,
  budget: StageBudget = {},
): Promise<RetrievalOutcome> {
  const preset = PRESETS[presetId];
  const run = runs[preset.run];
  if (!run) throw new NotIngestedError(`Preset ${presetId} needs an active "${preset.run}" run. Ingest it first.`);
  if (run.embeddingModel !== deps.embedder.model || run.embeddingDims !== deps.embedder.dimensions) {
    throw new Error(`Run ${run.id.slice(0, 8)} was embedded with ${run.embeddingModel}/${run.embeddingDims}; queries use ${deps.embedder.model}/${deps.embedder.dimensions}.`);
  }

  const trace: TraceStage[] = [];
  const tokens = { analysis: 0, rerank: 0 };
  const k = preset.k;

  // 1. Analysis and the raw question's embedding, in parallel.
  let start = performance.now();
  const chapters = preset.analyze ? await chapterTitles(deps.sql, run.id) : [];
  const [analysis, rawEmbedding] = await Promise.all([
    preset.analyze
      ? withinBudget(
          budget.analyzeMs,
          (signal) => analyzeQuery(deps.gemini, question, { chapters, signal, onUsage: (t) => (tokens.analysis += t) }),
          () => fallbackAnalysis(question, chapters),
        )
      : Promise.resolve(null),
    deps.embedder.embedQuery(question),
  ]);
  if (analysis) {
    trace.push({
      stage: "analyze",
      ms: elapsed(start),
      summary: `${analysis.intent}${analysis.fallback ? " (fallback)" : ""}${describeFilters(analysis.filters)}${analysis.subQueries.length ? ` · ${analysis.subQueries.length} sub-queries` : ""}`,
      details: analysis,
    });
  }

  // 2. Queries to run, embedded in one batch.
  start = performance.now();
  const queries = analysis ? [analysis.rewrittenQuery, ...analysis.subQueries] : [question];
  const embeddings = analysis
    ? queries[0] === question && queries.length === 1
      ? [rawEmbedding]
      : await deps.embedder.embedQueries(queries)
    : [rawEmbedding];
  const filters: QueryFilters = analysis?.filters ?? {};

  // 3. Summary routing for broad questions (B6).
  let routedSections: string[] | null = null;
  if (preset.summaries && analysis && (analysis.intent === "summary" || analysis.intent === "explanation")) {
    const route = await routeBySummaries(deps.sql, run.id, rawEmbedding);
    routedSections = route.sectionIds.length ? route.sectionIds : null;
    trace.push({ stage: "route", ms: elapsed(start), summary: `${route.routed.length} sections via summaries`, details: route.routed });
    start = performance.now();
  }

  // 4. Search every query (and, when routed, both inside and outside the route).
  const lists: Candidate[][] = [];
  const perQuery: { q: string; candidates: number; relaxed: string[] }[] = [];
  for (let i = 0; i < queries.length; i += 1) {
    const searches = [null, ...(routedSections ? [routedSections] : [])];
    for (const sectionIds of searches) {
      const result = await searchWithRelaxation(deps.sql, {
        runId: run.id,
        query: queries[i],
        embedding: embeddings[i],
        mode: preset.search,
        filters,
        sectionIds,
      });
      lists.push(result.candidates.map((c) => ({ ...c, queryIndex: i })));
      perQuery.push({ q: `${queries[i]}${sectionIds ? " (routed)" : ""}`, candidates: result.candidates.length, relaxed: result.relaxed });
    }
  }
  // Lists from the same query (routed + unrestricted) share its quota.
  const queryOfList = lists.map((list, i) => list[0]?.queryIndex ?? Math.floor(i / (routedSections ? 2 : 1)));
  const pool: Pooled[] = fuseLists(lists, CONFIG.retrieval.rrfK).map((c) => ({
    ...c,
    queries: [...new Set(c.queries.map((listIndex) => queryOfList[listIndex]))],
  }));
  const relaxations = perQuery.reduce((sum, q) => sum + q.relaxed.length, 0);
  trace.push({
    stage: "search",
    ms: elapsed(start),
    summary: `${preset.search} · ${perQuery.length} ${perQuery.length === 1 ? "query" : "queries"} · ${pool.length} candidates${relaxations ? ` · ${relaxations} relaxation(s)` : ""}`,
    details: {
      perQuery,
      top: pool.slice(0, 15).map((c) => ({ id: c.chunkId.slice(0, 8), type: c.contentType, section: c.sectionPath.join(PATH_SEPARATOR), pages: `${c.pageStart}-${c.pageEnd}`, vRank: c.vectorRank, kRank: c.keywordRank, score: Number(c.fused.toFixed(4)) })),
    },
  });

  // 5. Rerank (B5+) or take the fused order.
  start = performance.now();
  let ranked: RankedCandidate[];
  const candidatePool = pool.slice(0, CONFIG.retrieval.candidatePool);
  if (preset.rerank) {
    const { scores, failed, timedOut } = await withinBudget<{ scores: Map<string, number>; failed: boolean; timedOut?: boolean }>(
      budget.rerankMs,
      (signal) => rerank(deps.gemini, analysis?.rewrittenQuery ?? question, candidatePool, (t) => (tokens.rerank += t), signal),
      () => ({ scores: new Map(), failed: true, timedOut: true }),
    );
    if (failed) {
      ranked = selectWithQuotas(candidatePool, k, queries.length).map((c) => ({ ...c, finalScore: c.fused }));
      trace.push({ stage: "rerank", ms: elapsed(start), summary: `${timedOut ? "over its time budget" : "failed"} — kept fused order` });
    } else {
      const scored = candidatePool
        .map((c) => ({ ...c, rerankScore: scores.get(c.chunkId) ?? 0, finalScore: (scores.get(c.chunkId) ?? 0) / 10 + c.fused }))
        .filter((c) => c.rerankScore >= CONFIG.retrieval.rerankMinScore)
        .sort((a, b) => b.finalScore - a.finalScore);
      ranked = selectWithQuotas(scored, k, queries.length);
      trace.push({
        stage: "rerank",
        ms: elapsed(start),
        summary: `${candidatePool.length} → ${ranked.length} kept`,
        details: candidatePool.map((c) => ({ id: c.chunkId.slice(0, 8), section: c.sectionPath.join(PATH_SEPARATOR), score: scores.get(c.chunkId) ?? 0, kept: ranked.some((r) => r.chunkId === c.chunkId) })),
      });
    }
  } else {
    ranked = selectWithQuotas(candidatePool, k, queries.length).map((c) => ({ ...c, finalScore: c.fused }));
  }

  // 6. Context.
  start = performance.now();
  const sectionIds = [...new Set(ranked.map((c) => c.sectionId).filter((id): id is string => Boolean(id)))];
  const [sections, kids] =
    preset.context === "smallToBig"
      ? await Promise.all([sectionInfo(deps.sql, sectionIds), sectionChildren(deps.sql, sectionIds)])
      : [new Map(), []];
  const children = new Map<string, typeof kids>();
  for (const kid of kids) children.set(kid.sectionId, [...(children.get(kid.sectionId) ?? []), kid]);

  const assembled = assembleContext({
    final: ranked,
    mode: preset.context,
    sections,
    children,
    parentMaxTokens: CONFIG.retrieval.parentMaxTokens,
    budget: CONFIG.retrieval.contextTokenBudget,
  });
  trace.push({
    stage: "context",
    ms: elapsed(start),
    summary: `${assembled.stats.blocks} blocks · ${(assembled.stats.tokens / 1000).toFixed(1)}k/${assembled.stats.budget / 1000}k tok${assembled.stats.merged ? ` · ${assembled.stats.merged} merged` : ""}${assembled.stats.dropped.length ? ` · ${assembled.stats.dropped.length} dropped` : ""}`,
    details: assembled.stats,
  });

  return {
    preset: presetId,
    runIds: [run.id],
    analysis,
    candidates: pool,
    final: ranked,
    sources: assembled.sources,
    context: assembled.context,
    trace,
    tokens,
  };
}

function describeFilters(filters: QueryAnalysis["filters"]): string {
  const parts = [
    filters.regions?.join(", "),
    filters.countries?.join(", "),
    filters.years?.join(", "),
    filters.contentTypes?.join(", "),
    filters.chapter,
  ].filter(Boolean);
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}
