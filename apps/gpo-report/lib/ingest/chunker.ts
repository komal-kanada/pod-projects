import { overlapTail, splitRecursively } from "@pod/rag/split";
import { DOCUMENT, RAG_CONFIG, type ChunkConfig } from "../config";
import type { Paragraph, PreparedChunk } from "../types";

/**
 * Section-aware recursive chunking with overlap.
 *
 * Why chunk at all: the whole report can't go to the model for every
 * question, and smaller passages retrieve far more precisely.
 *
 * 1. Paragraphs are grouped by section, in reading order.
 * 2. Within a section, whole paragraphs are packed up to `targetChars`; a
 *    paragraph that alone is too big is split recursively (paragraph → line →
 *    sentence → clause → word).
 * 3. Chunks never cross a section boundary, but they may cross pages — a
 *    paragraph that runs over a page break stays together, and the chunk
 *    records both pages.
 * 4. Each chunk after the first in a section starts with the tail of the
 *    previous one, trimmed to a sentence start, so an answer that spans the
 *    seam is still retrievable.
 * 5. Fragments under `minChars` merge into a neighbour in the same top-level
 *    section instead of becoming useless header-only chunks.
 *
 * Sizes are characters, not tokens: no tokeniser needed, and ~4 characters
 * per token lands 3200 characters near 800 tokens.
 */

interface Piece {
  text: string;
  pageStart: number;
  pageEnd: number;
}

interface Draft extends Piece {
  sectionPath: string[];
  /** Overlap carried from the previous chunk (not counted toward packing). */
  carried: string;
}

const SEPARATOR = " › ";

function sameSection(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((part, i) => part === b[i]);
}

/** Consecutive paragraphs with the same section path. */
function groupBySection(paragraphs: Paragraph[]): Paragraph[][] {
  const groups: Paragraph[][] = [];
  for (const paragraph of paragraphs) {
    const last = groups.at(-1);
    if (last && sameSection(last[0].sectionPath, paragraph.sectionPath)) last.push(paragraph);
    else groups.push([paragraph]);
  }
  return groups;
}

/** Packs a section's paragraphs into pieces no longer than `target`. */
function packSection(paragraphs: Paragraph[], target: number): Piece[] {
  const pieces: Piece[] = [];
  let current: Piece | null = null;

  const push = (piece: Piece) => {
    if (current && current.text.length + 2 + piece.text.length <= target) {
      current = {
        text: `${current.text}\n\n${piece.text}`,
        pageStart: current.pageStart,
        pageEnd: Math.max(current.pageEnd, piece.pageEnd),
      };
      return;
    }
    if (current) pieces.push(current);
    current = piece;
  };

  for (const paragraph of paragraphs) {
    const parts =
      paragraph.text.length > target
        ? splitRecursively(paragraph.text, target)
        : [paragraph.text];
    for (const text of parts) {
      push({ text, pageStart: paragraph.pageNumber, pageEnd: paragraph.pageNumber });
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Merges fragments shorter than `minChars` into a same-chapter neighbour. */
function mergeSmall(drafts: Draft[], minChars: number): Draft[] {
  const result: Draft[] = [];
  for (const draft of drafts) {
    const previous = result.at(-1);
    const sameChapter = previous && previous.sectionPath[0] === draft.sectionPath[0];
    if (previous && sameChapter && (draft.text.length < minChars || previous.text.length < minChars)) {
      previous.text = `${previous.text}\n\n${draft.text}`;
      previous.pageEnd = Math.max(previous.pageEnd, draft.pageEnd);
      previous.pageStart = Math.min(previous.pageStart, draft.pageStart);
      // A merged chunk belongs to the deepest section both share.
      let common = 0;
      while (
        common < previous.sectionPath.length &&
        previous.sectionPath[common] === draft.sectionPath[common]
      ) {
        common += 1;
      }
      previous.sectionPath = previous.sectionPath.slice(0, common);
      continue;
    }
    result.push({ ...draft });
  }
  return result;
}

export function contextualHeader(sectionPath: string, pageStart: string, pageEnd: string): string {
  const pages = pageStart === pageEnd ? `Page ${pageStart}` : `Pages ${pageStart}–${pageEnd}`;
  return [DOCUMENT.title, sectionPath ? `Section: ${sectionPath}` : null, pages]
    .filter(Boolean)
    .join(" | ");
}

export function chunkParagraphs(
  paragraphs: Paragraph[],
  pageLabels: Map<number, string>,
  config: ChunkConfig = RAG_CONFIG.chunk,
): PreparedChunk[] {
  const drafts: Draft[] = [];

  for (const group of groupBySection(paragraphs)) {
    const pieces = packSection(group, config.targetChars);
    pieces.forEach((piece, i) => {
      const carried = i > 0 ? overlapTail(pieces[i - 1].text, config.overlapChars) : "";
      drafts.push({ ...piece, sectionPath: group[0].sectionPath, carried });
    });
  }

  const merged = mergeSmall(drafts, config.minChars).filter(
    (draft) => draft.text.trim().length > 40,
  );

  return merged.map((draft, index) => {
    const content = draft.carried ? `${draft.carried}\n\n${draft.text}` : draft.text;
    const sectionPath = draft.sectionPath.join(SEPARATOR);
    const pageLabelStart = pageLabels.get(draft.pageStart) ?? String(draft.pageStart);
    const pageLabelEnd = pageLabels.get(draft.pageEnd) ?? String(draft.pageEnd);
    const embedText = config.contextualHeader
      ? `${contextualHeader(sectionPath, pageLabelStart, pageLabelEnd)}\n${content}`
      : content;

    return {
      index,
      content,
      embedText,
      sectionPath,
      pageStart: draft.pageStart,
      pageEnd: draft.pageEnd,
      pageLabelStart,
      pageLabelEnd,
    };
  });
}

export function chunkStats(chunks: PreparedChunk[]) {
  const sizes = chunks.map((chunk) => chunk.content.length).sort((a, b) => a - b);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return {
    chunks: chunks.length,
    avgChars: sizes.length ? Math.round(total / sizes.length) : 0,
    minChars: sizes[0] ?? 0,
    maxChars: sizes.at(-1) ?? 0,
    multiPageChunks: chunks.filter((chunk) => chunk.pageEnd > chunk.pageStart).length,
    sections: new Set(chunks.map((chunk) => chunk.sectionPath)).size,
  };
}
