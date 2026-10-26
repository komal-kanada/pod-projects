import { Type, type Gemini } from "@pod/ai";
import { z } from "zod";
import { CONFIG } from "../config";
import { chapterInQuestion, validateFilters } from "../metadata/validate";
import { analyzePrompt } from "../prompts";
import type { QueryAnalysis } from "../types";

/**
 * Query analysis (B4+, 06 §2): one Gemini call that classifies the intent,
 * rewrites the question in the report's vocabulary, splits comparisons into
 * sub-queries and proposes filters. Proposed filters are validated against
 * the vocabularies; on any failure the question is used as-is.
 *
 * `out_of_scope` never refuses early — retrieval still runs and the answer
 * model decides from the evidence. It only shows up in the trace.
 */
const schema = z.object({
  intent: z.enum(["fact", "numeric", "comparison", "summary", "explanation", "out_of_scope"]),
  rewrittenQuery: z.string().min(1),
  subQueries: z.array(z.string()).default([]),
  filters: z
    .object({
      regions: z.array(z.string()).optional(),
      countries: z.array(z.string()).optional(),
      years: z.array(z.number()).optional(),
      contentTypes: z.array(z.string()).optional(),
      chapter: z.string().optional(),
    })
    .default({}),
  wantsForecast: z.boolean().optional(),
});

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    intent: { type: Type.STRING, enum: ["fact", "numeric", "comparison", "summary", "explanation", "out_of_scope"] },
    rewrittenQuery: { type: Type.STRING },
    subQueries: { type: Type.ARRAY, items: { type: Type.STRING } },
    filters: {
      type: Type.OBJECT,
      properties: {
        regions: { type: Type.ARRAY, items: { type: Type.STRING } },
        countries: { type: Type.ARRAY, items: { type: Type.STRING } },
        years: { type: Type.ARRAY, items: { type: Type.INTEGER } },
        contentTypes: { type: Type.ARRAY, items: { type: Type.STRING, enum: ["table", "figure", "box", "text"] } },
        chapter: { type: Type.STRING },
      },
    },
    wantsForecast: { type: Type.BOOLEAN },
  },
  required: ["intent", "rewrittenQuery", "subQueries", "filters"],
};

export function fallbackAnalysis(question: string, chapters: string[] = []): QueryAnalysis {
  const chapter = chapterInQuestion(question, chapters);
  return { intent: "fact", rewrittenQuery: question, subQueries: [], filters: chapter ? { chapter } : {}, fallback: true };
}

export async function analyzeQuery(
  gemini: Gemini,
  question: string,
  { chapters, onUsage, signal }: { chapters: string[]; onUsage?: (tokens: number) => void; signal?: AbortSignal },
): Promise<QueryAnalysis> {
  try {
    const raw = await gemini.generateJson({
      prompt: analyzePrompt(question, chapters),
      schema: responseSchema,
      temperature: 0,
      maxOutputTokens: 512,
      signal,
      validate: (value) => schema.parse(value),
      onUsage: (usage) => onUsage?.(usage.input + usage.output),
    });
    const { filters, dropped } = validateFilters(raw.filters as QueryAnalysis["filters"], { chapters });
    // A chapter the question names outright wins over the model's guess.
    const named = chapterInQuestion(question, chapters);
    if (named) filters.chapter = named;
    const subQueries = raw.intent === "comparison" || raw.subQueries.length > 1
      ? raw.subQueries.map((q) => q.trim()).filter(Boolean).slice(0, CONFIG.retrieval.maxSubQueries)
      : [];
    return {
      intent: raw.intent,
      rewrittenQuery: raw.rewrittenQuery.trim() || question,
      subQueries,
      filters,
      wantsForecast: raw.wantsForecast,
      dropped,
    };
  } catch {
    return fallbackAnalysis(question, chapters);
  }
}
