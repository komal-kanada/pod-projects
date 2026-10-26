import { lastSentence, splitRecursively } from "@pod/rag/split";
import { estimateTokens } from "@pod/rag/tokens";
import { CONFIG } from "../config";
import { extractMetadata } from "../metadata/extract";
import { flattenTree } from "../structure/tree";
import type { Block, ParseSource, PreparedChunk, SectionNode } from "../types";
import { contextualHeader } from "./contextual-header";
import {
  defaultTableLine,
  figureContent,
  footnoteText,
  splitTable,
  tableContent,
  tableEmbedBody,
  tableTitle,
  type TableBlock,
} from "./special-blocks";

/**
 * Index small, answer big (05 §1). Child chunks are small, single-topic
 * units inside one leaf section — precise to retrieve. At answer time they
 * are expanded back to their section (or a window of it) for context.
 *
 * - Whole paragraphs/lists packed to ~1600 chars (max 2400); an oversized
 *   block is split by sentences.
 * - Never across a section boundary.
 * - Tables and figures become their own chunks; the child keeps a
 *   "[See Table …]" placeholder so it still reads naturally.
 * - One sentence of overlap from the previous child.
 */
export interface ChunkContext {
  pageLabels: string[];
  reportYear: number;
  parseSourceForPage: (page: number) => ParseSource;
  /** One-line table descriptions keyed by table markdown (from the LLM, cached). */
  tableLines?: Map<string, string>;
}

interface Unit {
  text: string;
  pageStart: number;
  pageEnd: number;
}

function label(context: ChunkContext, page: number): string {
  return context.pageLabels[page - 1] || String(page);
}

function blockUnit(block: Block): Unit | null {
  if (block.kind === "paragraph") {
    return { text: block.text + footnoteText(block.footnotes), pageStart: block.page, pageEnd: block.pageEnd ?? block.page };
  }
  if (block.kind === "list") {
    return { text: block.items.map((item) => `- ${item}`).join("\n") + footnoteText(block.footnotes), pageStart: block.page, pageEnd: block.page };
  }
  return null;
}

export function buildHierarchicalChunks(root: SectionNode, context: ChunkContext): PreparedChunk[] {
  const chunks: Omit<PreparedChunk, "index">[] = [];
  const { targetChars, maxChars } = CONFIG.chunk.child;

  for (const section of flattenTree(root)) {
    if (!section.retrievable || section.blocks.length === 0) continue;

    const chapter = section.path[0] ?? null;
    const contentType = section.kind === "box" ? "box" : "text";
    let ordinal = 0;
    let buffer: Unit[] = [];
    let previousText = "";

    const make = (
      partial: Pick<PreparedChunk, "contentType" | "title" | "content" | "pageStart" | "pageEnd"> & { embedBody?: string },
    ) => {
      const meta = extractMetadata(`${partial.title ?? ""}\n${partial.content}`, {
        inheritedRegions: section.regions,
        reportYear: context.reportYear,
      });
      const labelStart = label(context, partial.pageStart);
      const labelEnd = label(context, partial.pageEnd);
      const header = contextualHeader({
        path: section.path,
        regions: meta.regions,
        years: meta.years,
        type: partial.contentType,
        pageStart: labelStart,
        pageEnd: labelEnd,
      });
      chunks.push({
        sectionKey: section.key,
        ordinalInSection: ordinal++,
        contentType: partial.contentType,
        title: partial.title,
        content: partial.content,
        embedText: `${header}\n${partial.embedBody ?? partial.content}`,
        sectionPath: section.path,
        chapter,
        pageStart: partial.pageStart,
        pageEnd: partial.pageEnd,
        pageLabelStart: labelStart,
        pageLabelEnd: labelEnd,
        parseSource: context.parseSourceForPage(partial.pageStart),
        tokenCount: estimateTokens(partial.content),
        ...meta,
      });
    };

    const flush = () => {
      if (buffer.length === 0) return;
      const body = buffer.map((unit) => unit.text).join("\n\n");
      const overlap = previousText ? lastSentence(previousText) : "";
      const content = overlap && !body.startsWith(overlap) ? `${overlap}\n\n${body}` : body;
      make({
        contentType,
        title: section.kind === "box" ? section.title : null,
        content,
        pageStart: Math.min(...buffer.map((u) => u.pageStart)),
        pageEnd: Math.max(...buffer.map((u) => u.pageEnd)),
      });
      previousText = body;
      buffer = [];
    };

    const add = (unit: Unit) => {
      const pieces = unit.text.length > maxChars ? splitRecursively(unit.text, targetChars) : [unit.text];
      for (const text of pieces) {
        const size = buffer.reduce((sum, u) => sum + u.text.length + 2, 0);
        if (buffer.length && size + text.length > targetChars) flush();
        buffer.push({ ...unit, text });
      }
    };

    for (const block of section.blocks) {
      const unit = blockUnit(block);
      if (unit) {
        add(unit);
        continue;
      }
      if (block.kind === "table") {
        add({ text: `[See ${tableTitle(block)}]`, pageStart: block.page, pageEnd: block.page });
        flush();
        addTable(block);
        continue;
      }
      if (block.kind === "figure") {
        add({ text: `[See Figure: ${block.title}]`, pageStart: block.page, pageEnd: block.page });
        flush();
        make({ contentType: "figure", title: block.title, content: figureContent(block), pageStart: block.page, pageEnd: block.page });
      }
    }
    flush();

    function addTable(table: TableBlock) {
      const parts = splitTable(table, CONFIG.chunk.tableMaxChars);
      const line = context.tableLines?.get(table.markdown) ?? defaultTableLine(table);
      parts.forEach((markdown, index) => {
        make({
          contentType: "table",
          title: tableTitle(table),
          content: tableContent(table, markdown, { index, total: parts.length }),
          embedBody: tableEmbedBody(table, line),
          pageStart: table.page,
          pageEnd: table.pageEnd ?? table.page,
        });
      });
    }
  }

  return chunks.map((chunk, index) => ({ ...chunk, index }));
}

/** Every table in the tree, for generating summary lines before chunking. */
export function collectTables(root: SectionNode): TableBlock[] {
  return flattenTree(root).flatMap((section) =>
    section.retrievable ? section.blocks.filter((block): block is TableBlock => block.kind === "table") : [],
  );
}
