import { Type, type Gemini } from "@pod/ai";
import { z } from "zod";
import { CONFIG } from "../config";
import { PHASES } from "../normalize/glossary";
import { analyzePrompt } from "../prompts";
import type { QueryAnalysis } from "../types";

/**
 * Query analysis (M3+, 06 §2). Target types are *boosts*, never filters;
 * variants are filters with fallback, and only names from the report's own
 * variant vocabulary survive validation. Any failure → the question as-is.
 */
const INTENTS = ["numeric", "explanation", "comparison", "methodology", "yes_no", "out_of_scope"] as const;
const TYPES = ["text", "table", "chart", "footnote", "callout"] as const;

const schema = z.object({
  intent: z.enum(INTENTS),
  targetTypes: z.array(z.string()).default([]),
  variants: z.array(z.string()).default([]),
  phases: z.array(z.string()).default([]),
  rewrittenQuery: z.string().min(1),
  subQueries: z.array(z.string()).default([]),
});

export function fallbackAnalysis(question: string): QueryAnalysis {
  return { intent: "explanation", targetTypes: [], variants: [], phases: [], rewrittenQuery: question, subQueries: [], fallback: true };
}

export async function analyzeQuery(
  gemini: Gemini,
  question: string,
  { variants, onUsage }: { variants: string[]; onUsage?: (tokens: number) => void },
): Promise<QueryAnalysis> {
  try {
    const raw = await gemini.generateJson({
      prompt: analyzePrompt(question, variants),
      temperature: 0,
      maxOutputTokens: 512,
      schema: {
        type: Type.OBJECT,
        properties: {
          intent: { type: Type.STRING, enum: [...INTENTS] },
          targetTypes: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...TYPES] } },
          variants: { type: Type.ARRAY, items: { type: Type.STRING } },
          phases: { type: Type.ARRAY, items: { type: Type.STRING } },
          rewrittenQuery: { type: Type.STRING },
          subQueries: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["intent", "targetTypes", "variants", "phases", "rewrittenQuery", "subQueries"],
      },
      validate: (value) => schema.parse(value),
      onUsage: (usage) => onUsage?.(usage.input + usage.output),
    });

    const dropped: string[] = [];
    const lowerVocab = new Map(variants.map((v) => [v.toLowerCase(), v]));
    const validVariants = raw.variants.flatMap((v) => {
      const match = lowerVocab.get(v.toLowerCase().trim());
      if (!match) dropped.push(`variant:${v}`);
      return match ? [match] : [];
    });
    const validPhases = raw.phases.map((p) => p.toLowerCase().replace(/[\s-]+/g, "_")).filter((p) => {
      const ok = p in PHASES;
      if (!ok) dropped.push(`phase:${p}`);
      return ok;
    });

    return {
      intent: raw.intent,
      targetTypes: raw.targetTypes.filter((t): t is QueryAnalysis["targetTypes"][number] => (TYPES as readonly string[]).includes(t)),
      variants: validVariants,
      phases: validPhases,
      rewrittenQuery: raw.rewrittenQuery.trim() || question,
      subQueries: raw.intent === "comparison" ? raw.subQueries.filter(Boolean).slice(0, CONFIG.retrieval.maxSubQueries) : [],
      dropped,
    };
  } catch {
    return fallbackAnalysis(question);
  }
}

/** Chunk kinds to boost for an analysis (numbers → tables/charts; methodology → footnotes). */
export function boostKinds(analysis: QueryAnalysis | null): string[] | null {
  if (!analysis) return null;
  const kinds = new Set<string>();
  const types = new Set(analysis.targetTypes);
  if (analysis.intent === "numeric") ["table", "chart", "callout"].forEach((t) => types.add(t as never));
  if (analysis.intent === "methodology") types.add("footnote");
  for (const type of types) {
    if (type === "table") kinds.add("table_row").add("table_summary");
    if (type === "chart") kinds.add("chart_fact").add("chart_summary");
    if (type === "footnote") kinds.add("footnote");
    if (type === "callout") kinds.add("callout");
    if (type === "text") kinds.add("text");
  }
  return kinds.size ? [...kinds] : null;
}
