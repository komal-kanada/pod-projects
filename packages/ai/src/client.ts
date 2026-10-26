import {
  GoogleGenAI,
  createPartFromBase64,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponseUsageMetadata,
  type Part,
  type SchemaUnion,
} from "@google/genai";
import { GeminiError, QUOTA_MESSAGE, describeGeminiError, withRetry, type RetryOptions } from "./errors";
import { GENERATION_MODEL, NO_ZERO_THINKING_BUDGET } from "./models";

/**
 * The Gemini text/vision client every POD app shares.
 *
 * It takes its key as an argument and never reads the environment, so a
 * package can't quietly connect one app to another app's quota: each app
 * builds its own client from its own env (see each app's `lib/env.ts`).
 */

export interface TokenUsage {
  input: number;
  output: number;
}

/** A prompt is plain text, or a list of parts when images/PDFs go along. */
export type PromptInput = string | Part[];

export interface PromptRequest {
  system?: string;
  /** Prior turns, oldest first. */
  history?: Content[];
  prompt: PromptInput;
  /** Override the default generation model for this call. */
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** 0 disables thinking — right for fast, mechanical steps. */
  thinkingBudget?: number;
  signal?: AbortSignal;
  /** Called once with the token counts Gemini reports for this call. */
  onUsage?: (usage: TokenUsage) => void;
}

export interface JsonRequest<T> extends PromptRequest {
  schema: SchemaUnion;
  /** Validates the parsed JSON (e.g. a zod `parse`). Throwing triggers one retry. */
  validate?: (value: unknown) => T;
}

export interface Gemini {
  readonly generationModel: string;
  generateText(request: PromptRequest): Promise<string>;
  generateJson<T>(request: JsonRequest<T>): Promise<T>;
  streamText(request: PromptRequest): AsyncGenerator<string>;
  /** The underlying SDK client, for embeddings and anything not wrapped here. */
  readonly sdk: GoogleGenAI;
}

export function createGemini({
  apiKey,
  generationModel = GENERATION_MODEL,
  retry,
  fallbackModels = [],
  onFallback = (from, to, error) => console.warn(`Gemini ${from}: ${error.kind} → trying ${to}`),
}: {
  apiKey: string;
  generationModel?: string;
  /** Overrides the retry policy — batch scripts can afford to wait out a per-minute limit. */
  retry?: RetryOptions;
  /**
   * Models to try, in order, when a call's model is out of quota, rate limited
   * or overloaded. Each has its own quota, so one running dry doesn't stop the app.
   */
  fallbackModels?: string[];
  onFallback?: (from: string, to: string, error: GeminiError) => void;
}): Gemini {
  const sdk = new GoogleGenAI({ apiKey });
  /** Models whose daily quota ran out in this process — skipped until restart. */
  const exhausted = new Set<string>();

  async function withFallback<T>(first: string, call: (model: string) => Promise<T>): Promise<T> {
    const chain = [first, ...fallbackModels.filter((m) => m !== first)];
    const usable = chain.filter((m) => !exhausted.has(m));
    if (usable.length === 0) throw new GeminiError(QUOTA_MESSAGE, false, { kind: "quota" });
    let lastError: GeminiError | null = null;
    for (const [i, model] of usable.entries()) {
      try {
        return await call(model);
      } catch (cause) {
        const error = describeGeminiError(cause);
        // The chosen model's other errors are the caller's to see. A fallback
        // model failing for its own reasons (e.g. a 400 on a setting it doesn't
        // support) shouldn't stop the chain — only a bad key, a safety block or
        // a cancel should.
        const modelTrouble = error.kind === "quota" || error.kind === "rate_limit" || error.kind === "busy";
        const stops = error.kind === "auth" || error.kind === "blocked" || error.kind === "cancelled";
        if (!modelTrouble && (i === 0 || stops)) throw error;
        if (error.kind === "quota") exhausted.add(model);
        lastError = error;
        const next = usable[i + 1];
        if (next) onFallback(model, next, error);
      }
    }
    throw lastError!;
  }

  function contents(request: PromptRequest): Content[] {
    const parts =
      typeof request.prompt === "string"
        ? [{ text: request.prompt }]
        : request.prompt;
    return [...(request.history ?? []), { role: "user", parts }];
  }

  function config(
    request: PromptRequest,
    model: string,
    extra?: GenerateContentConfig,
  ): GenerateContentConfig {
    const budget = request.thinkingBudget ?? 0;
    return {
      systemInstruction: request.system,
      temperature: request.temperature ?? 0.4,
      maxOutputTokens: request.maxOutputTokens ?? 2048,
      ...(budget === 0 && NO_ZERO_THINKING_BUDGET.has(model) ? {} : { thinkingConfig: { thinkingBudget: budget } }),
      abortSignal: request.signal,
      ...extra,
    };
  }

  function report(
    request: PromptRequest,
    usage: GenerateContentResponseUsageMetadata | undefined,
  ) {
    if (!request.onUsage || !usage) return;
    request.onUsage({
      input: usage.promptTokenCount ?? 0,
      output: usage.candidatesTokenCount ?? 0,
    });
  }

  async function generateText(request: PromptRequest): Promise<string> {
    return withFallback(request.model ?? generationModel, (model) => withRetry(async () => {
      const response = await sdk.models.generateContent({
        model,
        contents: contents(request),
        config: config(request, model),
      });
      const text = response.text?.trim();
      if (!text) {
        throw new GeminiError("The model returned an empty response.", true);
      }
      report(request, response.usageMetadata);
      return text;
    }, retry));
  }

  /**
   * Structured generation. A malformed or invalid response is retried once
   * and then becomes a caught error, never a broken screen.
   */
  async function generateJson<T>(request: JsonRequest<T>): Promise<T> {
    return withFallback(request.model ?? generationModel, (model) => withRetry(
      async () => {
        const response = await sdk.models.generateContent({
          model,
          contents: contents(request),
          config: config(request, model, {
            responseMimeType: "application/json",
            responseSchema: request.schema,
          }),
        });
        const text = response.text?.trim();
        if (!text) {
          throw new GeminiError("The model returned an empty response.", true);
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new GeminiError("The model's reply wasn't valid JSON.", true);
        }

        let value: T;
        try {
          value = request.validate ? request.validate(parsed) : (parsed as T);
        } catch (cause) {
          throw new GeminiError(
            "The model's reply didn't match the expected shape.",
            true,
            { cause },
          );
        }
        report(request, response.usageMetadata);
        return value;
      },
      { attempts: 2, ...retry },
    ));
  }

  /** Streams text as it arrives, for anything a person reads live. */
  async function* streamText(request: PromptRequest): AsyncGenerator<string> {
    const stream = await withFallback(request.model ?? generationModel, (model) => withRetry(() =>
      sdk.models.generateContentStream({
        model,
        contents: contents(request),
        config: config(request, model),
      }),
    ));

    let usage: GenerateContentResponseUsageMetadata | undefined;
    for await (const chunk of stream) {
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
      const text = chunk.text;
      if (text) yield text;
    }
    report(request, usage);
  }

  return { generationModel, generateText, generateJson, streamText, sdk };
}

/** An image or PDF to send alongside a prompt. */
export function binaryPart(bytes: Uint8Array, mimeType: string): Part {
  return createPartFromBase64(Buffer.from(bytes).toString("base64"), mimeType);
}

export function textPart(text: string): Part {
  return { text };
}
