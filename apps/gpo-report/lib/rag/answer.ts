import { describeGeminiError, type Embedder, type Gemini } from "@pod/ai";
import type { Sql } from "@pod/db";
import { isRefusal, parseCitations } from "@pod/rag/citations";
import { RAG_CONFIG, type RetrievalMode } from "../config";
import { logQuery } from "../db/queries";
import { retrieve } from "../retrieval/retrieve";
import type { AskEvent, IngestionRun, RetrievalResult } from "../types";
import { buildContext, toSources } from "./context";
import { ANSWER_SYSTEM_PROMPT, REFUSAL_TEXT, answerUserPrompt } from "./prompts";

/**
 * The online half of RAG: retrieve → build context → generate → cite → log.
 *
 * `answerStream` yields events for the UI (sources first, then tokens, then
 * a summary); `answerOnce` drains the same stream for the CLI and the eval,
 * so all three run identical logic.
 */
export interface AnswerDeps {
  sql: Sql;
  gemini: Gemini;
  embedder: Embedder;
}

export interface AnswerOptions {
  mode?: RetrievalMode;
  topK?: number;
  source?: "app" | "cli" | "eval";
  signal?: AbortSignal;
}

export async function* answerStream(
  deps: AnswerDeps,
  run: IngestionRun,
  question: string,
  { mode = RAG_CONFIG.retrieval.mode, topK = RAG_CONFIG.retrieval.topK, source = "app", signal }: AnswerOptions = {},
): AsyncGenerator<AskEvent & { retrieval?: RetrievalResult; context?: string }> {
  const started = performance.now();
  let retrieval: RetrievalResult | null = null;
  let answer = "";
  let firstTokenMs: number | null = null;
  let error: string | null = null;

  try {
    retrieval = await retrieve(deps, run, question, { mode, topK });
    const context = buildContext(retrieval.chunks);
    yield { type: "sources", runId: run.id, mode, sources: toSources(retrieval.chunks), retrieval, context };

    if (retrieval.chunks.length === 0) {
      answer = REFUSAL_TEXT;
      yield { type: "token", text: answer };
    } else {
      for await (const text of deps.gemini.streamText({
        system: ANSWER_SYSTEM_PROMPT,
        prompt: answerUserPrompt(context, question),
        temperature: RAG_CONFIG.generation.temperature,
        maxOutputTokens: RAG_CONFIG.generation.maxOutputTokens,
        signal,
      })) {
        firstTokenMs ??= performance.now() - started;
        answer += text;
        yield { type: "token", text };
      }
    }
  } catch (cause) {
    const failure = describeGeminiError(cause);
    error = cause instanceof Error ? cause.message : String(cause);
    yield { type: "error", message: failure.message, retryable: failure.retryable, code: failure.kind };
  }

  const latencyMs = performance.now() - started;
  const citations = parseCitations(answer, retrieval?.chunks.length ?? 0);
  const queryId = await logQuery(deps.sql, {
    runId: run.id,
    question,
    mode,
    topK: retrieval?.topK ?? topK,
    retrieved: retrieval?.chunks ?? [],
    answer: answer || null,
    citations: citations.valid,
    invalidCitations: citations.invalid,
    generationModel: deps.gemini.generationModel,
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
      queryId,
    };
  }
}

export interface AnswerResult {
  answer: string;
  retrieval: RetrievalResult | null;
  context: string;
  citations: number[];
  invalidCitations: number[];
  refused: boolean;
  latencyMs: number;
  firstTokenMs: number | null;
  error: string | null;
  /** GeminiErrorKind when the model failed, e.g. "quota". */
  errorCode: string | null;
}

export async function answerOnce(
  deps: AnswerDeps,
  run: IngestionRun,
  question: string,
  options: AnswerOptions = {},
): Promise<AnswerResult> {
  const result: AnswerResult = {
    answer: "",
    retrieval: null,
    context: "",
    citations: [],
    invalidCitations: [],
    refused: false,
    latencyMs: 0,
    firstTokenMs: null,
    error: null,
    errorCode: null,
  };

  for await (const event of answerStream(deps, run, question, options)) {
    if (event.type === "sources") {
      result.retrieval = event.retrieval ?? null;
      result.context = event.context ?? "";
    } else if (event.type === "token") {
      result.answer += event.text;
    } else if (event.type === "done") {
      Object.assign(result, {
        citations: event.citations,
        invalidCitations: event.invalidCitations,
        refused: event.refused,
        latencyMs: event.latencyMs,
        firstTokenMs: event.firstTokenMs,
      });
    } else if (event.type === "error") {
      result.error = event.message;
      result.errorCode = event.code ?? null;
    }
  }
  return result;
}
