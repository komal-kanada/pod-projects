import { overlapTail, splitRecursively } from "@pod/rag/split";
import { estimateTokens } from "@pod/rag/tokens";
import { CONFIG, DOCUMENT } from "../config";
import { extractMetadata } from "../metadata/extract";
import { flattenTree } from "../structure/tree";
import type { ParseSource, PreparedChunk, SectionNode } from "../types";

/**
 * B0/B1: GPO-style fixed-size chunks — 3200 chars with 400 overlap, packed
 * across the document with no knowledge of sections. B0 feeds it the text
 * layer, B1 the Gemini markdown; the difference between them measures what
 * structured parsing alone buys.
 *
 * The section path stored on a flat chunk is looked up from the tree by page
 * — for display and section metrics only. It is not embedded, so the
 * baseline gains nothing from structure it doesn't have.
 */
export function buildFlatChunks(
  pages: { text: string; source: ParseSource }[],
  {
    pageLabels,
    reportYear,
    tree,
  }: { pageLabels: string[]; reportYear: number; tree?: SectionNode },
): PreparedChunk[] {
  const { targetChars, overlapChars } = CONFIG.chunk.flat;
  const leaves = tree ? flattenTree(tree).filter((node) => node.level > 0) : [];
  const sectionAt = (page: number) =>
    leaves.filter((node) => node.pageStart <= page && node.pageEnd >= page).sort((a, b) => b.level - a.level)[0];

  const paragraphs = pages.flatMap((page, index) =>
    page.text
      .split(/\n{2,}/)
      .map((text) => text.trim())
      .filter(Boolean)
      .flatMap((text) => splitRecursively(text, targetChars))
      .map((text) => ({ text, page: index + 1, source: page.source })),
  );

  const drafts: { text: string; pageStart: number; pageEnd: number; source: ParseSource }[] = [];
  let current: (typeof drafts)[number] | null = null;
  for (const paragraph of paragraphs) {
    if (current && current.text.length + 2 + paragraph.text.length <= targetChars) {
      current.text += `\n\n${paragraph.text}`;
      current.pageEnd = paragraph.page;
      continue;
    }
    if (current) drafts.push(current);
    current = { text: paragraph.text, pageStart: paragraph.page, pageEnd: paragraph.page, source: paragraph.source };
  }
  if (current) drafts.push(current);

  return drafts.map((draft, index) => {
    const carried = index > 0 ? overlapTail(drafts[index - 1].text, overlapChars) : "";
    const content = carried ? `${carried}\n\n${draft.text}` : draft.text;
    const labelStart = pageLabels[draft.pageStart - 1] || String(draft.pageStart);
    const labelEnd = pageLabels[draft.pageEnd - 1] || String(draft.pageEnd);
    const section = sectionAt(draft.pageStart);
    const pages = labelStart === labelEnd ? `Page ${labelStart}` : `Pages ${labelStart}–${labelEnd}`;
    return {
      index,
      sectionKey: null,
      ordinalInSection: null,
      contentType: "flat" as const,
      title: null,
      content,
      embedText: `${DOCUMENT.title} | ${pages}\n${content}`,
      sectionPath: section?.path ?? [],
      chapter: section?.path[0] ?? null,
      pageStart: draft.pageStart,
      pageEnd: draft.pageEnd,
      pageLabelStart: labelStart,
      pageLabelEnd: labelEnd,
      parseSource: draft.source,
      tokenCount: estimateTokens(content),
      ...extractMetadata(content, { reportYear }),
    };
  });
}
