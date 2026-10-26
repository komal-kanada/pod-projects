import { RAG_CONFIG, type ChunkConfig } from "../lib/config";

/** --chunk / --overlap / --no-header → a chunk config (experiments E1–E3). */
export function chunkOptions(values: { chunk?: string; overlap?: string; "no-header"?: boolean }): ChunkConfig {
  const number = (raw: string | undefined, fallback: number) => {
    if (raw === undefined) return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Not a number: ${raw}`);
    return parsed;
  };
  return {
    ...RAG_CONFIG.chunk,
    targetChars: number(values.chunk, RAG_CONFIG.chunk.targetChars),
    overlapChars: number(values.overlap, RAG_CONFIG.chunk.overlapChars),
    contextualHeader: values["no-header"] ? false : RAG_CONFIG.chunk.contextualHeader,
  };
}
