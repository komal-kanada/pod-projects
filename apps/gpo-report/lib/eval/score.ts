import { hitAtK, mean, overlaps, percentile, recallAtK, reciprocalRank } from "@pod/eval/metrics";
import type { RetrievedChunk } from "../types";
import type { GoldQuestion } from "./questions";

/**
 * Turns one question's retrieval + answer into numbers (07 §2). A retrieved
 * chunk "hits" if its page range overlaps any expected page.
 */
export interface QuestionResult {
  id: string;
  question: string;
  source: GoldQuestion["source"];
  category: GoldQuestion["category"];
  labelled: boolean;
  expectedPages: number[];
  retrievedPages: [number, number][];
  hits: boolean[];
  hit1: number | null;
  hit3: number | null;
  hit6: number | null;
  recall6: number | null;
  mrr: number | null;
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
  error?: string | null;
}

export function scoreRetrieval(question: GoldQuestion, chunks: RetrievedChunk[], labelled: boolean): QuestionResult {
  const inScope = question.category !== "out_of_scope";
  const hits = chunks.map((chunk) => overlaps(chunk.pageStart, chunk.pageEnd, question.expected_pages));
  const scored = inScope && labelled;
  const ranges = chunks.map((chunk) => {
    const pages: number[] = [];
    for (let p = chunk.pageStart; p <= chunk.pageEnd; p += 1) pages.push(p);
    return pages;
  });

  return {
    id: question.id,
    question: question.question,
    source: question.source,
    category: question.category,
    labelled,
    expectedPages: question.expected_pages,
    retrievedPages: chunks.map((chunk) => [chunk.pageStart, chunk.pageEnd]),
    hits,
    hit1: scored ? hitAtK(hits, 1) : null,
    hit3: scored ? hitAtK(hits, 3) : null,
    hit6: scored ? hitAtK(hits, 6) : null,
    recall6: scored ? recallAtK(ranges, question.expected_pages, 6) : null,
    mrr: scored ? reciprocalRank(hits) : null,
  };
}

export interface Summary {
  questions: number;
  scored: number;
  hit1: number | null;
  hit3: number | null;
  hit6: number | null;
  recall6: number | null;
  mrr: number | null;
  correctness: number | null;
  faithfulness: number | null;
  citationAccuracy: number | null;
  invalidCitations: number;
  outOfScopeRefusal: number | null;
  wrongRefusals: number;
  latencyP50: number | null;
  latencyP95: number | null;
  firstTokenP50: number | null;
}

const values = (results: QuestionResult[], pick: (r: QuestionResult) => number | null | undefined) =>
  results.map(pick).filter((v): v is number => typeof v === "number");

export function summarise(results: QuestionResult[]): Summary {
  const inScope = results.filter((r) => r.category !== "out_of_scope");
  const outOfScope = results.filter((r) => r.category === "out_of_scope" && r.refused !== undefined);
  const answered = inScope.filter((r) => r.answer !== undefined);

  return {
    questions: results.length,
    scored: inScope.filter((r) => r.hit6 !== null).length,
    hit1: mean(values(inScope, (r) => r.hit1)),
    hit3: mean(values(inScope, (r) => r.hit3)),
    hit6: mean(values(inScope, (r) => r.hit6)),
    recall6: mean(values(inScope, (r) => r.recall6)),
    mrr: mean(values(inScope, (r) => r.mrr)),
    correctness: mean(values(inScope, (r) => (r.correctness ?? null) === null ? null : r.correctness! / 2)),
    faithfulness: mean(
      values(
        answered.filter((r) => !r.refused),
        (r) => (r.faithful === null || r.faithful === undefined ? null : r.faithful ? 1 : 0),
      ),
    ),
    citationAccuracy: mean(values(answered.filter((r) => r.labelled && !r.refused), (r) => r.citationHit)),
    invalidCitations: results.reduce((sum, r) => sum + (r.invalidCitations?.length ?? 0), 0),
    outOfScopeRefusal: outOfScope.length ? mean(outOfScope.map((r) => (r.refused ? 1 : 0))) : null,
    wrongRefusals: answered.filter((r) => r.refused).length,
    latencyP50: percentile(values(results, (r) => r.latencyMs), 50),
    latencyP95: percentile(values(results, (r) => r.latencyMs), 95),
    firstTokenP50: percentile(values(results, (r) => r.firstTokenMs), 50),
  };
}
