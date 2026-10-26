import type { AnswerSource, RetrievedChunk } from "../types";
import { pageLabel } from "../types";

/**
 * Formats retrieved chunks into the numbered <context> block the model
 * answers from. Chunks stay in rank order (most relevant first); at k = 6 the
 * context is ~5k tokens, so nothing needs truncating.
 *
 * Attribute values are escaped so report text can't close the tag early.
 */
function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function pagesAttr(chunk: RetrievedChunk): string {
  const start = chunk.pageLabelStart ?? String(chunk.pageStart);
  const end = chunk.pageLabelEnd ?? String(chunk.pageEnd);
  return start === end ? start : `${start}-${end}`;
}

export function buildContext(chunks: RetrievedChunk[]): string {
  const blocks = chunks.map((chunk, index) => {
    const section = chunk.sectionPath ? ` section="${attr(chunk.sectionPath)}"` : "";
    const body = chunk.content.replace(/<\/chunk>/gi, "</ chunk>");
    return `<chunk id="${index + 1}" pages="${attr(pagesAttr(chunk))}"${section}>\n${body}\n</chunk>`;
  });
  return `<context>\n${blocks.join("\n")}\n</context>`;
}

export function toSources(chunks: RetrievedChunk[]): AnswerSource[] {
  return chunks.map((chunk, index) => ({
    n: index + 1,
    chunkId: chunk.chunkId,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    pageLabel: pageLabel(chunk.pageLabelStart ?? chunk.pageStart, chunk.pageLabelEnd ?? chunk.pageEnd),
    section: chunk.sectionPath,
    similarity: chunk.similarity,
    content: chunk.content,
  }));
}
