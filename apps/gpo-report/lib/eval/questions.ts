import { readFile } from "node:fs/promises";
import { z } from "zod";

/**
 * The gold set (07-evaluation.md §1). Provided sample questions are copied
 * verbatim and never edited; added questions give the metrics weight.
 */
export const CATEGORIES = ["factual", "numeric", "summary", "multi_hop", "out_of_scope"] as const;

export const questionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(3),
  source: z.enum(["provided", "added"]),
  category: z.enum(CATEGORIES),
  expected_answer: z.string().nullable(),
  must_include: z.array(z.string()).default([]),
  /** Phrases that fail the answer if present — e.g. a figure from the wrong year. */
  must_not_include: z.array(z.string()).default([]),
  /** 1-based PDF page indices; any one is enough for a hit. */
  expected_pages: z.array(z.number().int().positive()).default([]),
  notes: z.string().default(""),
});

export const goldSetSchema = z.object({
  version: z.number().int(),
  document: z.string(),
  questions: z.array(questionSchema),
});

export type GoldQuestion = z.infer<typeof questionSchema>;
export type GoldSet = z.infer<typeof goldSetSchema>;

export function parseGoldSet(raw: unknown): GoldSet {
  const set = goldSetSchema.parse(raw);
  const ids = new Set<string>();
  for (const question of set.questions) {
    if (ids.has(question.id)) throw new Error(`Duplicate question id ${question.id}.`);
    ids.add(question.id);
  }
  return set;
}

export async function loadGoldSet(path = "eval/questions.json"): Promise<GoldSet> {
  return parseGoldSet(JSON.parse(await readFile(path, "utf8")));
}

/** Can this question be scored for retrieval/correctness yet? */
export function isLabelled(question: GoldQuestion): boolean {
  if (question.category === "out_of_scope") return true;
  return question.expected_pages.length > 0 && Boolean(question.expected_answer);
}
