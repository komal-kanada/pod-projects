import { describeGeminiError, type Embedder, type Gemini } from "@pod/ai";
import type { Sql } from "@pod/db";
import { isRefusal, parseCitations } from "@pod/rag/citations";
import { CONFIG, type PresetId } from "../config";
import { logQuery } from "../db/queries";
import { ANSWER_SYSTEM_PROMPT, DISAGREEMENT_PATTERN, REFUSAL_TEXT, answerUserPrompt } from "../prompts";
import { runRetrieval } from "../retrieval/pipeline";
import type { AskEvent, IngestionRun, RetrievalOutcome, RunKey } from "../types";
import { loadImageParts } from "./images";

/**
 * retrieve → generate (multimodal in M4) → cite → log. If the model says an
 * image disagrees with the extracted data, that's logged — a free signal of
 * extraction errors to review in the Explorer.
 */
export type AnswerDeps = { sql: Sql; embedder: Embedder; gemini: Gemini };

export function parseDisagreements(answer: string): number[] {
  return [...new Set([...answer.matchAll(DISAGREEMENT_PATTERN)].map((m) => Number(m[1])))];
}

export async function* answerStream(
  deps: AnswerDeps,
  runs: Partial<Record<RunKey, IngestionRun>>,
  question: string,
  { preset, source = "app", signal }: { preset: PresetId; source?: "app" | "cli" | "eval"; signal?: AbortSignal },
): AsyncGenerator<AskEvent & { outcome?: RetrievalOutcome }> {
  const started = performance.now();
  let outcome: RetrievalOutcome | null = null;
  let answer = "";
  let firstTokenMs: number | null = null;
  let error: string | null = null;
  const generation = { input: 0, output: 0 };

  try {
    outcome = await runRetrieval(deps, runs, question, preset);
    if (outcome.analysis) yield { type: "analysis", analysis: outcome.analysis };
    yield { type: "sources", preset, sources: outcome.sources, outcome };

    const generateStart = performance.now();
    if (outcome.sources.length === 0) {
      answer = REFUSAL_TEXT;
      yield { type: "token", text: answer };
    } else {
      const imageParts = await loadImageParts(outcome.images);
      const prompt = imageParts.length
        ? [{ text: outcome.contextText }, ...imageParts, { text: answerUserPrompt("", question).trim() }]
        : answerUserPrompt(outcome.contextText, question);
      for await (const text of deps.gemini.streamText({
        system: ANSWER_SYSTEM_PROMPT,
        prompt,
        temperature: CONFIG.generation.temperature,
        maxOutputTokens: CONFIG.generation.maxOutputTokens,
        signal,
        onUsage: (usage) => Object.assign(generation, usage),
      })) {
        firstTokenMs ??= performance.now() - started;
        answer += text;
        yield { type: "token", text };
      }
    }
    outcome.trace.push({
      stage: "generate",
      ms: Math.round(performance.now() - generateStart),
      summary: `${CONFIG.generation.model}${outcome.images.length ? ` · ${outcome.images.length} image(s)` : ""}${generation.input ? ` · ${generation.input} in / ${generation.output} out tok` : ""}`,
    });
    yield { type: "trace", trace: outcome.trace };
  } catch (cause) {
    const failure = describeGeminiError(cause);
    error = cause instanceof Error ? cause.message : String(cause);
    yield { type: "error", message: cause instanceof Error && cause.name === "NotIngestedError" ? cause.message : failure.message, retryable: failure.retryable, code: failure.kind };
  }

  const latencyMs = performance.now() - started;
  const citations = parseCitations(answer.replace(DISAGREEMENT_PATTERN, ""), outcome?.sources.length ?? 0);
  const disagreements = parseDisagreements(answer);
  const queryId = await logQuery(deps.sql, {
    question,
    preset,
    runId: outcome?.runId ?? null,
    analysis: outcome?.analysis ?? null,
    trace: outcome?.trace ?? [],
    sources: outcome?.sources ?? [],
    answer: answer || null,
    citations: citations.valid,
    invalidCitations: citations.invalid,
    disagreements,
    tokens: { analysis: outcome?.tokens.analysis ?? 0, generation },
    latencyMs,
    firstTokenMs,
    error,
    source,
  });

  if (!error) {
    yield {
      type: "done",
      latencyMs,
      firstTokenMs,
      citations: citations.valid,
      invalidCitations: citations.invalid,
      refused: isRefusal(answer, REFUSAL_TEXT),
      disagreements,
      images: outcome?.images.length ?? 0,
      queryId,
    };
  }
}

export interface AnswerResult {
  answer: string;
  outcome: RetrievalOutcome | null;
  citations: number[];
  invalidCitations: number[];
  refused: boolean;
  disagreements: number[];
  latencyMs: number;
  firstTokenMs: number | null;
  error: string | null;
  /** GeminiErrorKind when the model failed, e.g. "quota". */
  errorCode: string | null;
}

export async function answerOnce(
  deps: AnswerDeps,
  runs: Partial<Record<RunKey, IngestionRun>>,
  question: string,
  options: { preset: PresetId; source?: "app" | "cli" | "eval" },
): Promise<AnswerResult> {
  const result: AnswerResult = { answer: "", outcome: null, citations: [], invalidCitations: [], refused: false, disagreements: [], latencyMs: 0, firstTokenMs: null, error: null, errorCode: null };
  for await (const event of answerStream(deps, runs, question, options)) {
    if (event.type === "sources") result.outcome = event.outcome ?? null;
    else if (event.type === "token") result.answer += event.text;
    else if (event.type === "error") Object.assign(result, { error: event.message, errorCode: event.code ?? null });
    else if (event.type === "done") {
      Object.assign(result, {
        citations: event.citations, invalidCitations: event.invalidCitations, refused: event.refused,
        disagreements: event.disagreements, latencyMs: event.latencyMs, firstTokenMs: event.firstTokenMs,
      });
    }
  }
  return result;
}
