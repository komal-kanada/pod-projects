import { describeGeminiError } from "@pod/ai";
import { isRefusal, parseCitations } from "@pod/rag/citations";
import { CONFIG, type PresetId, type RunKind } from "../config";
import { logQuery } from "../db/queries";
import { ANSWER_SYSTEM_PROMPT, REFUSAL_TEXT, answerUserPrompt } from "../prompts";
import { runRetrieval, type RetrievalDeps } from "../retrieval/pipeline";
import type { AskEvent, IngestionRun, RetrievalOutcome } from "../types";

/**
 * retrieve (per preset) → generate (stream) → cite → log.
 * Event order for the UI: analysis → sources → trace → tokens → done.
 * `answerOnce` drains the same stream for the CLI and eval.
 */
export async function* answerStream(
  deps: RetrievalDeps,
  runs: Partial<Record<RunKind, IngestionRun>>,
  question: string,
  { preset, source = "app", signal }: { preset: PresetId; source?: "app" | "cli" | "eval"; signal?: AbortSignal },
): AsyncGenerator<AskEvent & { outcome?: RetrievalOutcome }> {
  const started = performance.now();
  let outcome: RetrievalOutcome | null = null;
  let answer = "";
  let firstTokenMs: number | null = null;
  let error: string | null = null;
  const generation = { input: 0, output: 0 };

  // The web app has Vercel's 60s ceiling; the CLI and eval don't.
  const budget = source === "app" ? CONFIG.retrieval.appBudget : null;
  const overall = budget ? AbortSignal.timeout(budget.totalMs) : null;
  const generationSignal = overall && signal ? AbortSignal.any([signal, overall]) : (overall ?? signal);

  try {
    outcome = await runRetrieval(deps, runs, question, preset, budget ?? {});
    if (outcome.analysis) yield { type: "analysis", analysis: outcome.analysis };
    yield { type: "sources", preset, sources: outcome.sources, outcome };

    const generateStart = performance.now();
    if (outcome.sources.length === 0) {
      answer = REFUSAL_TEXT;
      yield { type: "token", text: answer };
    } else {
      for await (const text of deps.gemini.streamText({
        system: ANSWER_SYSTEM_PROMPT,
        prompt: answerUserPrompt(outcome.context, question, outcome.analysis?.intent),
        temperature: CONFIG.generation.temperature,
        maxOutputTokens: CONFIG.generation.maxOutputTokens,
        signal: generationSignal,
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
      summary: `${CONFIG.generation.model}${generation.input ? ` · ${generation.input} in / ${generation.output} out tok` : ""}`,
    });
    yield { type: "trace", trace: outcome.trace };
  } catch (cause) {
    const failure = describeGeminiError(cause);
    error = cause instanceof Error ? cause.message : String(cause);
    yield {
      type: "error",
      message: overall?.aborted
        ? "The model is slow right now and the answer ran out of time. Trying again usually works."
        : cause instanceof Error && cause.name === "NotIngestedError"
          ? cause.message
          : failure.message,
      retryable: overall?.aborted ? true : failure.retryable,
      code: overall?.aborted ? "busy" : failure.kind,
    };
  }

  const latencyMs = performance.now() - started;
  const citations = parseCitations(answer, outcome?.sources.length ?? 0);
  const contextTokens = outcome?.sources.reduce((sum, s) => sum + s.tokens, 0) ?? 0;
  const queryId = await logQuery(deps.sql, {
    question,
    preset,
    runIds: outcome?.runIds ?? [],
    analysis: outcome?.analysis ?? null,
    trace: outcome?.trace ?? [],
    sources: outcome?.sources ?? [],
    answer: answer || null,
    citations: citations.valid,
    invalidCitations: citations.invalid,
    tokens: { ...outcome?.tokens, generation },
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
      contextTokens,
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
  latencyMs: number;
  firstTokenMs: number | null;
  contextTokens: number;
  error: string | null;
  /** GeminiErrorKind when the model failed, e.g. "quota". */
  errorCode: string | null;
}

export async function answerOnce(
  deps: RetrievalDeps,
  runs: Partial<Record<RunKind, IngestionRun>>,
  question: string,
  options: { preset: PresetId; source?: "app" | "cli" | "eval" },
): Promise<AnswerResult> {
  const result: AnswerResult = {
    answer: "", outcome: null, citations: [], invalidCitations: [], refused: false,
    latencyMs: 0, firstTokenMs: null, contextTokens: 0, error: null, errorCode: null,
  };
  for await (const event of answerStream(deps, runs, question, options)) {
    if (event.type === "sources") result.outcome = event.outcome ?? null;
    else if (event.type === "token") result.answer += event.text;
    else if (event.type === "error") Object.assign(result, { error: event.message, errorCode: event.code ?? null });
    else if (event.type === "done") {
      Object.assign(result, {
        citations: event.citations, invalidCitations: event.invalidCitations, refused: event.refused,
        latencyMs: event.latencyMs, firstTokenMs: event.firstTokenMs, contextTokens: event.contextTokens,
      });
    }
  }
  return result;
}
