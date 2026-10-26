import type { Embedder } from "./embeddings";
import { normalise } from "./embeddings";

/**
 * A deterministic, offline stand-in for Gemini embeddings — for tests and for
 * exercising the pipeline before a key exists. Never used in production.
 *
 * It is the "hashing trick": every word and word pair is hashed into one of
 * `dimensions` buckets, so texts sharing vocabulary end up close together.
 * That is crude lexical similarity, not meaning, but it is stable and makes
 * retrieval tests assert real rankings.
 */
export function createFakeEmbedder(dimensions = 768): Embedder {
  function hash(token: string): number {
    let h = 2166136261;
    for (let i = 0; i < token.length; i += 1) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function vectorFor(text: string): number[] {
    const vector = new Array<number>(dimensions).fill(0);
    const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const tokens = [
      ...words,
      ...words.slice(1).map((word, i) => `${words[i]} ${word}`),
    ];
    for (const token of tokens) {
      const h = hash(token);
      vector[h % dimensions] += h & 1 ? 1 : -1;
    }
    return normalise(vector);
  }

  return {
    model: "fake-hash-embedding",
    dimensions,
    async embedDocuments(texts, options) {
      const vectors = texts.map(vectorFor);
      options?.onProgress?.(vectors.length, texts.length);
      return vectors;
    },
    async embedQuery(text) {
      return vectorFor(text);
    },
    async embedQueries(texts) {
      return texts.map(vectorFor);
    },
  };
}
