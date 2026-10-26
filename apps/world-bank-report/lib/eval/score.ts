import { hitAtK, mean, ndcgAtK, overlaps, percentile, recallAtK, reciprocalRank } from "@pod/eval/metrics";
import type { Candidate, ContextSource } from "../types";
import { PATH_SEPARATOR } from "../types";
import type { GoldQuestion } from "./questions";

/**
 * Long-document metrics (10 §2). Ranked-list metrics use the final ranked
 * chunks (before context assembly); context metrics use what the model
 * actually saw.
 */
export interface QuestionResult {
  id: string;
  question: string;
  source: GoldQuestion["source"];
  category: GoldQuestion["category"];
  preset: string;
  labelled: boolean;
  retrievedPages: [number, number][];
  hit1: number | null;
  hit5: number | null;
  hit10: number | null;
  recall10: number | null;
  mrr: number | null;
  ndcg10: number | null;
  sectionAcc5: number | null;
  contextHit: number | null;
  contextPrecision: number | null;
  contextTokens: number;
  llmTokens?: number;
  answer?: string;
  refused?: boolean;
  citations?: number[];
  invalidCitations?: number[];
  citationHit?: number | null;
  correctness?: number | null;
  correctnessReason?: string;
  faithful?: boolean | null;
  unsupportedClaims?: string[];
  latencyMs?: number;
  firstTokenMs?: number | null;
  analysis?: unknown;
  error?: string | null;
}

export function sectionMatches(path: string[], expected: string[]): boolean {
  const joined = path.join(PATH_SEPARATOR).toLowerCase();
  return expected.some((prefix) => {
    const p = prefix.toLowerCase().trim();
    return joined === p || joined.startsWith(`${p}${PATH_SEPARATOR.toLowerCase()}`);
  });
}

export function scoreRetrieval(
  q: GoldQuestion,
  preset: string,
  ranked: Candidate[],
  sources: ContextSource[],
  labelled: boolean,
): QuestionResult {
  const scored = labelled && q.category !== "out_of_scope";
  const pageHits = ranked.map((c) => overlaps(c.pageStart, c.pageEnd, q.expected_pages));
  const sectionHits = ranked.map((c) => q.expected_sections.length > 0 && sectionMatches(c.sectionPath, q.expected_sections));
  const grades = ranked.map((_, i) => (pageHits[i] ? 2 : sectionHits[i] ? 1 : 0));
  const ranges = ranked.map((c) => Array.from({ length: c.pageEnd - c.pageStart + 1 }, (_, i) => c.pageStart + i));
  const contextTokens = sources.reduce((sum, s) => sum + s.tokens, 0);
  const correctTokens = sources
    .filter((s) => overlaps(s.pageStart, s.pageEnd, q.expected_pages) || (q.expected_sections.length && sectionMatches(s.sectionPath, q.expected_sections)))
    .reduce((sum, s) => sum + s.tokens, 0);

  return {
    id: q.id,
    question: q.question,
    source: q.source,
    category: q.category,
    preset,
    labelled,
    retrievedPages: ranked.map((c) => [c.pageStart, c.pageEnd]),
    hit1: scored ? hitAtK(pageHits, 1) : null,
    hit5: scored ? hitAtK(pageHits, 5) : null,
    hit10: scored ? hitAtK(pageHits, 10) : null,
    recall10: scored ? recallAtK(ranges, q.expected_pages, 10) : null,
    mrr: scored ? reciprocalRank(pageHits) : null,
    ndcg10: scored ? ndcgAtK(grades, 10) : null,
    sectionAcc5: scored && q.expected_sections.length ? hitAtK(sectionHits, 5) : null,
    contextHit: scored ? (sources.some((s) => overlaps(s.pageStart, s.pageEnd, q.expected_pages)) ? 1 : 0) : null,
    contextPrecision: scored && contextTokens ? correctTokens / contextTokens : null,
    contextTokens,
  };
}

export interface Summary {
  n: number;
  hit1: number | null;
  hit5: number | null;
  hit10: number | null;
  recall10: number | null;
  mrr: number | null;
  ndcg10: number | null;
  sectionAcc5: number | null;
  contextHit: number | null;
  contextPrecision: number | null;
  correctness: number | null;
  faithfulness: number | null;
  citationAccuracy: number | null;
  outOfScopeRefusal: number | null;
  wrongRefusals: number;
  contextTokensMean: number | null;
  contextTokensP95: number | null;
  llmTokensMean: number | null;
  latencyP50: number | null;
  latencyP95: number | null;
}

const nums = (rs: QuestionResult[], f: (r: QuestionResult) => number | null | undefined) =>
  rs.map(f).filter((v): v is number => typeof v === "number");

export function summarise(results: QuestionResult[]): Summary {
  const inScope = results.filter((r) => r.category !== "out_of_scope");
  const oos = results.filter((r) => r.category === "out_of_scope" && r.refused !== undefined);
  const answered = inScope.filter((r) => r.answer !== undefined);
  return {
    n: results.length,
    hit1: mean(nums(inScope, (r) => r.hit1)),
    hit5: mean(nums(inScope, (r) => r.hit5)),
    hit10: mean(nums(inScope, (r) => r.hit10)),
    recall10: mean(nums(inScope, (r) => r.recall10)),
    mrr: mean(nums(inScope, (r) => r.mrr)),
    ndcg10: mean(nums(inScope, (r) => r.ndcg10)),
    sectionAcc5: mean(nums(inScope, (r) => r.sectionAcc5)),
    contextHit: mean(nums(inScope, (r) => r.contextHit)),
    contextPrecision: mean(nums(inScope, (r) => r.contextPrecision)),
    correctness: mean(nums(inScope, (r) => (typeof r.correctness === "number" ? r.correctness / 2 : null))),
    faithfulness: mean(nums(answered.filter((r) => !r.refused), (r) => (typeof r.faithful === "boolean" ? (r.faithful ? 1 : 0) : null))),
    citationAccuracy: mean(nums(answered.filter((r) => r.labelled && !r.refused), (r) => r.citationHit)),
    outOfScopeRefusal: oos.length ? mean(oos.map((r) => (r.refused ? 1 : 0))) : null,
    wrongRefusals: answered.filter((r) => r.refused).length,
    contextTokensMean: mean(nums(results, (r) => r.contextTokens)),
    contextTokensP95: percentile(nums(results, (r) => r.contextTokens), 95),
    llmTokensMean: mean(nums(results, (r) => r.llmTokens)),
    latencyP50: percentile(nums(results, (r) => r.latencyMs), 50),
    latencyP95: percentile(nums(results, (r) => r.latencyMs), 95),
  };
}

/** Did this question pass, for the flip list? Correctness when judged, else Hit@5. */
export function passed(r: QuestionResult): boolean | null {
  if (r.category === "out_of_scope") return r.refused === undefined ? null : r.refused;
  if (typeof r.correctness === "number") return r.correctness === 2;
  return r.hit5 === null ? null : r.hit5 === 1;
}
