import { hitAtK, mean, percentile, reciprocalRank } from "@pod/eval/metrics";
import { similarity } from "../extraction/score";
import type { ElementSource } from "../../types";
import type { GoldQuestion } from "./questions";

/** QA metrics (10 §2.2) over the sources the model saw, in score order. */
export interface QaResult {
  id: string;
  question: string;
  source: GoldQuestion["source"];
  category: GoldQuestion["category"];
  preset: string;
  labelled: boolean;
  sourcesSeen: { type: string; page: number; title: string | null }[];
  hit1: number | null;
  hit3: number | null;
  hit6: number | null;
  recall6: number | null;
  mrr: number | null;
  numericMatch?: number | null;
  footnoteUsed?: number | null;
  estimatedAsExact?: boolean;
  images?: number;
  answer?: string;
  refused?: boolean;
  citations?: number[];
  correctness?: number | null;
  correctnessReason?: string;
  faithful?: boolean | null;
  disagreements?: number[];
  latencyMs?: number;
  error?: string | null;
}

export function sourceMatches(source: ElementSource, expected: GoldQuestion["expected_elements"][number]): boolean {
  if (source.page !== expected.page) return false;
  if (source.type === "flat") return true; // M0/M1: right page counts (10 §2.1)
  if (source.type !== expected.type) return false;
  if (expected.marker) return source.title === `Footnote ${expected.marker}`;
  if (expected.title) return source.title ? similarity(source.title, expected.title) >= 0.6 : false;
  return true;
}

export function scoreRetrieval(q: GoldQuestion, preset: string, sources: ElementSource[], labelled: boolean): QaResult {
  const scored = labelled && q.category !== "out_of_scope";
  const hits = sources.map((s) => q.expected_elements.some((e) => sourceMatches(s, e)));
  const covered = q.expected_elements.filter((e) => sources.slice(0, 6).some((s) => sourceMatches(s, e))).length;
  return {
    id: q.id,
    question: q.question,
    source: q.source,
    category: q.category,
    preset,
    labelled,
    sourcesSeen: sources.map((s) => ({ type: s.type, page: s.page, title: s.title })),
    hit1: scored ? hitAtK(hits, 1) : null,
    hit3: scored ? hitAtK(hits, 3) : null,
    hit6: scored ? hitAtK(hits, 6) : null,
    recall6: scored && q.expected_elements.length ? covered / q.expected_elements.length : null,
    mrr: scored ? reciprocalRank(hits) : null,
  };
}

const nums = (rs: QaResult[], f: (r: QaResult) => number | null | undefined) => rs.map(f).filter((v): v is number => typeof v === "number");

export function summarise(results: QaResult[]) {
  const inScope = results.filter((r) => r.category !== "out_of_scope");
  const oos = results.filter((r) => r.category === "out_of_scope" && r.refused !== undefined);
  return {
    n: results.length,
    hit1: mean(nums(inScope, (r) => r.hit1)),
    hit3: mean(nums(inScope, (r) => r.hit3)),
    hit6: mean(nums(inScope, (r) => r.hit6)),
    recall6: mean(nums(inScope, (r) => r.recall6)),
    mrr: mean(nums(inScope, (r) => r.mrr)),
    numericMatch: mean(nums(inScope, (r) => r.numericMatch)),
    footnoteUsed: mean(nums(inScope, (r) => r.footnoteUsed)),
    estimatedAsExact: results.filter((r) => r.estimatedAsExact).length,
    correctness: mean(nums(inScope, (r) => (typeof r.correctness === "number" ? r.correctness / 2 : null))),
    faithfulness: mean(nums(inScope.filter((r) => !r.refused), (r) => (typeof r.faithful === "boolean" ? (r.faithful ? 1 : 0) : null))),
    outOfScopeRefusal: oos.length ? mean(oos.map((r) => (r.refused ? 1 : 0))) : null,
    wrongRefusals: inScope.filter((r) => r.refused).length,
    imagesMean: mean(nums(results, (r) => r.images)),
    latencyP50: percentile(nums(results, (r) => r.latencyMs), 50),
    latencyP95: percentile(nums(results, (r) => r.latencyMs), 95),
  };
}

export function passed(r: QaResult): boolean | null {
  if (r.category === "out_of_scope") return r.refused === undefined ? null : r.refused;
  if (typeof r.correctness === "number") return r.correctness === 2;
  return r.hit6 === null ? null : r.hit6 === 1;
}
