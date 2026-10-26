import gold from "@/eval/questions.json";
import { goldSetSchema } from "./eval/qa/questions";

/**
 * Sample-question chips: the provided, in-scope questions from the gold set,
 * verbatim. Imported at build time, so the chips ship with the deploy.
 */
export function sampleQuestions(limit = 6): string[] {
  try {
    return goldSetSchema.parse(gold)
      .questions.filter((q) => q.source === "provided" && q.category !== "out_of_scope")
      .slice(0, limit)
      .map((q) => q.question);
  } catch {
    return [];
  }
}
