import { readFile } from "node:fs/promises";
import { z } from "zod";

/** Gold set (10 §1). Provided questions verbatim; categories are long-document specific. */
export const CATEGORIES = [
  "fact", "numeric_table", "comparison", "cross_section", "summary",
  "figure_box", "disambiguation", "temporal", "out_of_scope",
] as const;

export const questionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(3),
  source: z.enum(["provided", "added"]),
  category: z.enum(CATEGORIES),
  expected_answer: z.string().nullable(),
  must_include: z.array(z.string()).default([]),
  /** Phrases that fail the answer if present — e.g. another region's name. */
  must_not_include: z.array(z.string()).default([]),
  expected_pages: z.array(z.number().int().positive()).default([]),
  /** Path prefixes joined with " › ", e.g. "Regional Outlooks › South Asia". */
  expected_sections: z.array(z.string()).default([]),
  notes: z.string().default(""),
});

export const goldSetSchema = z.object({ version: z.number().int(), questions: z.array(questionSchema) });
export type GoldQuestion = z.infer<typeof questionSchema>;
export type GoldSet = z.infer<typeof goldSetSchema>;

export function parseGoldSet(raw: unknown): GoldSet {
  const set = goldSetSchema.parse(raw);
  const ids = new Set<string>();
  for (const q of set.questions) {
    if (ids.has(q.id)) throw new Error(`Duplicate question id ${q.id}.`);
    ids.add(q.id);
  }
  return set;
}

export async function loadGoldSet(path = "eval/questions.json"): Promise<GoldSet> {
  return parseGoldSet(JSON.parse(await readFile(path, "utf8")));
}

export function isLabelled(q: GoldQuestion): boolean {
  return q.category === "out_of_scope" || (q.expected_pages.length > 0 && Boolean(q.expected_answer));
}
