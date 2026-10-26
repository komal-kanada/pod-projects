import type { GoogleGenAI } from "@google/genai";
import { GeminiError, withRetry } from "./errors";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./models";

/**
 * Turns text into vectors.
 *
 * An embedding is a list of numbers that stands for the *meaning* of a piece
 * of text; passages about the same idea land close together even when they
 * share no words. Two details matter for retrieval quality:
 *
 *  1. Task type. Gemini embeds documents and queries slightly differently.
 *     RETRIEVAL_DOCUMENT when storing and RETRIEVAL_QUERY when searching
 *     measurably improves the match.
 *  2. Normalisation. Gemini's vectors are unit length only at the full 3072
 *     dimensions. Asking for 768 truncates them, so we re-normalise — cosine
 *     distance in pgvector assumes it.
 */
export interface Embedder {
  /** Stored on every ingestion run; queries must use the same model + dims. */
  readonly model: string;
  readonly dimensions: number;
  embedDocuments(
    texts: string[],
    options?: { onProgress?: (completed: number, total: number) => void },
  ): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
  embedQueries(texts: string[]): Promise<number[][]>;
}

export function normalise(vector: number[]): number[] {
  let sumOfSquares = 0;
  for (const value of vector) sumOfSquares += value * value;
  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

export function createGeminiEmbedder({
  sdk,
  model = EMBEDDING_MODEL,
  dimensions = EMBEDDING_DIMENSIONS,
  batchSize = 50,
}: {
  sdk: GoogleGenAI;
  model?: string;
  dimensions?: number;
  /** Texts per request. Batches run one after another to stay under rate limits. */
  batchSize?: number;
}): Embedder {
  /**
   * Queries are live — a person is waiting — so they retry briefly. Document
   * batches run offline during ingestion and can wait out a per-minute limit
   * (4 + 8 + 16 + 32 + 64 s ≈ 2 min), honouring Gemini's own retry delay.
   */
  const RETRY = {
    RETRIEVAL_QUERY: { attempts: 5 },
    RETRIEVAL_DOCUMENT: { attempts: 6, baseDelayMs: 4_000, maxWaitMs: 65_000 },
  } as const;

  async function embed(
    texts: string[],
    taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  ): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await withRetry(
      () =>
        sdk.models.embedContent({
          model,
          contents: texts,
          config: { taskType, outputDimensionality: dimensions },
        }),
      RETRY[taskType],
    );

    const embeddings = response.embeddings ?? [];
    if (embeddings.length !== texts.length) {
      throw new GeminiError(
        `Expected ${texts.length} embeddings but received ${embeddings.length}.`,
        true,
      );
    }

    return embeddings.map((embedding, index) => {
      const values = embedding.values;
      if (!values || values.length !== dimensions) {
        throw new GeminiError(
          `Embedding ${index} came back with ${values?.length ?? 0} dimensions, expected ${dimensions}.`,
          true,
        );
      }
      return normalise(values);
    });
  }

  async function embedDocuments(
    texts: string[],
    options?: { onProgress?: (completed: number, total: number) => void },
  ): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += batchSize) {
      const batch = texts.slice(start, start + batchSize);
      vectors.push(...(await embed(batch, "RETRIEVAL_DOCUMENT")));
      options?.onProgress?.(vectors.length, texts.length);
    }
    return vectors;
  }

  async function embedQueries(texts: string[]): Promise<number[][]> {
    const trimmed = texts.map((text) => text.trim());
    if (trimmed.some((text) => !text)) {
      throw new GeminiError("Nothing to search for.", false);
    }
    return embed(trimmed, "RETRIEVAL_QUERY");
  }

  async function embedQuery(text: string): Promise<number[]> {
    const [vector] = await embedQueries([text]);
    return vector;
  }

  return { model, dimensions, embedDocuments, embedQuery, embedQueries };
}
