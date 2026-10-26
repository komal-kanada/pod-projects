import { readFile } from "node:fs/promises";
import { z } from "zod";

/** QA gold set (10 §2.1): categories by where the answer lives. */
export const CATEGORIES = ["text", "table", "chart", "footnote", "callout", "cross_type", "comparison", "out_of_scope"] as const;

export const questionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(3),
  source: z.enum(["provided", "added"]),
  category: z.enum(CATEGORIES),
  answer_location: z.array(z.string()).default([]),
  expected_answer: z.string().nullable(),
  must_include: z.array(z.string()).default([]),
  /** Phrases that fail the answer if present — e.g. a value from another chart. */
  must_not_include: z.array(z.string()).default([]),
  expected_values: z.array(z.object({ value: z.string(), unit: z.string().default("") })).default([]),
  expected_elements: z
    .array(z.object({ page: z.number().int(), type: z.string(), title: z.string().optional(), marker: z.string().optional() }))
    .default([]),
  notes: z.string().default(""),
});

export const goldSetSchema = z.object({ version: z.number().int(), questions: z.array(questionSchema) });
export type GoldQuestion = z.infer<typeof questionSchema>;

export async function loadGoldSet(path = "eval/questions.json") {
  const set = goldSetSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const ids = new Set<string>();
  for (const q of set.questions) {
    if (ids.has(q.id)) throw new Error(`Duplicate question id ${q.id}.`);
    ids.add(q.id);
  }
  return set;
}

export function isLabelled(q: GoldQuestion): boolean {
  return q.category === "out_of_scope" || (q.expected_elements.length > 0 && Boolean(q.expected_answer));
}
