import { Type, type Gemini } from "@pod/ai";
import { z } from "zod";
import { CONFIG } from "../config";
import { rerankPrompt } from "../prompts";
import type { Candidate } from "../types";
import { PATH_SEPARATOR } from "../types";

/**
 * Listwise rerank (B5+, 06 §5): one Gemini call scores up to 30 candidates
 * 0–10 for "contains information needed to answer". Cheaper than a
 * cross-encoder service and needs no second provider. On failure the fused
 * order stands and the trace says so.
 */
const schema = z.array(z.object({ id: z.string(), score: z.number() }));

function preview(candidate: Candidate): string {
  const limit = CONFIG.retrieval.rerankPreviewChars;
  if (candidate.contentType === "table") {
    return candidate.content.split("\n").slice(0, 8).join("\n").slice(0, limit);
  }
  return candidate.content.slice(0, limit);
}

function attr(value: string) {
  return value.replace(/"/g, "'");
}

export async function rerank(
  gemini: Gemini,
  query: string,
  candidates: Candidate[],
  onUsage?: (tokens: number) => void,
  signal?: AbortSignal,
): Promise<{ scores: Map<string, number>; failed: boolean }> {
  if (candidates.length === 0) return { scores: new Map(), failed: false };
  const passages = candidates
    .map(
      (c, i) =>
        `<passage id="c${i + 1}" section="${attr(c.sectionPath.join(PATH_SEPARATOR))}" pages="${c.pageLabelStart}-${c.pageLabelEnd}" type="${c.contentType}">\n${preview(c)}\n</passage>`,
    )
    .join("\n");

  try {
    const result = await gemini.generateJson({
      prompt: rerankPrompt(query, passages),
      schema: {
        type: Type.ARRAY,
        items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, score: { type: Type.NUMBER } }, required: ["id", "score"] },
      },
      temperature: 0,
      maxOutputTokens: 2048,
      signal,
      validate: (value) => schema.parse(value),
      onUsage: (usage) => onUsage?.(usage.input + usage.output),
    });
    const scores = new Map<string, number>();
    for (const { id, score } of result) {
      const index = Number(id.replace(/^c/, "")) - 1;
      if (candidates[index]) scores.set(candidates[index].chunkId, Math.max(0, Math.min(10, score)));
    }
    return { scores, failed: scores.size === 0 };
  } catch {
    return { scores: new Map(), failed: true };
  }
}
