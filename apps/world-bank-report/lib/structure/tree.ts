import { estimateTokens } from "@pod/rag/tokens";
import { CONFIG } from "../config";
import { findRegions } from "../metadata/extract";
import type { Block, SectionKind, SectionNode } from "../types";

/**
 * Blocks + PDF outline → a section tree (04 §6):
 *
 *   Report › Chapter › Section › Subsection (› Box)
 *
 * 1. The outline (bookmarks), when present, is the skeleton: authoritative
 *    titles and start pages. An entry opens at the heading that matches its
 *    title, or at the top of its page if no heading matches.
 * 2. Markdown headings that don't match the outline nest *under* the current
 *    outline entry, by their own heading level.
 * 3. Boxes become child nodes of the section they appear in.
 * 4. Regions in a section's title are inherited by everything below it, so a
 *    paragraph under "South Asia › Outlook" is about South Asia even when it
 *    never names it.
 * 5. A hand-checked outline (data/outline.json) can replace the bookmarks and
 *    set each entry's kind; a box entry closes after its last page. When the
 *    markdown already has that box as a block, the entry is dropped.
 */

export interface OutlineItem {
  title: string;
  pageNumber: number | null;
  level: number;
  kind?: SectionKind;
  /** Last page, for entries that end before the next one starts (boxes). */
  pageEnd?: number;
}

export function normaliseTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/^(chapter|part|section)\s+\d+[.:]?\s*/i, "")
    .replace(/^[\d.]+\s+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function titlesMatch(a: string, b: string): boolean {
  const x = normaliseTitle(a);
  const y = normaliseTitle(b);
  if (!x || !y) return false;
  return x === y || (x.length > 8 && y.startsWith(x)) || (y.length > 8 && x.startsWith(y));
}

const FRONT_MATTER = /^(foreword|preface|acknowledg|abbreviations|acronyms|(table of )?contents|executive summary|overview|key messages|about this report)/i;

function kindFor(title: string, level: number, beforeFirstChapter: boolean): SectionKind {
  if (/^(references|bibliography)/i.test(normaliseTitle(title)) || /^references|^bibliography/i.test(title)) return "references";
  if (/appendix|annex/i.test(title)) return "appendix";
  if (level === 1 && beforeFirstChapter && FRONT_MATTER.test(title.trim())) return "front_matter";
  if (level === 1) return "chapter";
  return "section";
}

interface Builder extends SectionNode {
  /** Markdown heading level that opened this node (for non-outline headings). */
  headingLevel: number | null;
  fromOutline: boolean;
  /** Closes once a later page starts. */
  closesAfter?: number;
}

export function buildTree(blocks: Block[], outline: OutlineItem[], pageCount: number): SectionNode {
  let ordinal = 0;
  const node = (title: string, level: number, parent: Builder | null, page: number, kind: SectionKind, headingLevel: number | null, fromOutline: boolean): Builder => {
    const path = parent && parent.level > 0 ? [...parent.path, title] : level === 0 ? [] : [title];
    const inherited = parent?.regions ?? [];
    const created: Builder = {
      key: `s${ordinal}`,
      title,
      level,
      ordinal: ordinal++,
      path,
      kind,
      pageStart: page,
      pageEnd: page,
      blocks: [],
      children: [],
      regions: [...new Set([...inherited, ...findRegions(title)])].sort(),
      retrievable: !CONFIG.chunk.excludeTitles.test(title.trim()) && kind !== "references" && (parent?.retrievable ?? true),
      ownTokenCount: 0,
      tokenCount: 0,
      headingLevel,
      fromOutline,
    };
    parent?.children.push(created);
    return created;
  };

  const root = node("Report", 0, null, 1, "report", null, false);
  const stack: Builder[] = [root];
  const top = () => stack[stack.length - 1];
  let seenChapter = false;

  const boxTitles = blocks.flatMap((block) => (block.kind === "box" ? [block.title] : []));
  const entries = outline
    .filter((entry) => entry.pageNumber !== null && entry.title.trim())
    .filter((entry) => !(entry.kind === "box" && boxTitles.some((title) => titlesMatch(title, entry.title))))
    .map((entry) => ({ ...entry, opened: false }));
  const minLevel = entries.length ? Math.min(...entries.map((e) => e.level)) : 1;

  function openOutline(entry: (typeof entries)[number], page: number) {
    entry.opened = true;
    const depth = entry.level - minLevel + 1;
    while (stack.length > 1 && (!top().fromOutline || top().level >= depth)) stack.pop();
    const kind = entry.kind ?? kindFor(entry.title, depth, !seenChapter);
    if (kind === "chapter") seenChapter = true;
    const created = node(entry.title, depth, top(), page, kind, null, true);
    if (entry.pageEnd) created.closesAfter = entry.pageEnd;
    stack.push(created);
  }

  function openHeading(text: string, headingLevel: number, page: number) {
    if (entries.length === 0) {
      // No outline: markdown heading levels are the structure.
      while (stack.length > 1 && (top().headingLevel ?? 0) >= headingLevel) stack.pop();
      const depth = top().level + 1;
      const kind = kindFor(text, depth, !seenChapter);
      if (kind === "chapter") seenChapter = true;
      stack.push(node(text, depth, top(), page, kind, headingLevel, false));
      return;
    }
    // Under an outline: non-matching headings nest below the current outline entry.
    while (stack.length > 1 && !top().fromOutline && (top().headingLevel ?? 0) >= headingLevel) stack.pop();
    stack.push(node(text, top().level + 1, top(), page, "section", headingLevel, false));
  }

  const headingsByPage = new Map<number, string[]>();
  for (const block of blocks) {
    if (block.kind === "heading") headingsByPage.set(block.page, [...(headingsByPage.get(block.page) ?? []), block.text]);
  }

  let currentPage = 0;
  for (const block of blocks) {
    if (block.page !== currentPage) {
      currentPage = block.page;
      const closing = stack.findIndex((open) => open.closesAfter !== undefined && open.closesAfter < currentPage);
      if (closing > 0) stack.length = closing;
      // Outline entries for this page whose title never appears as a heading
      // open at the top of the page.
      for (const entry of entries) {
        if (entry.opened || entry.pageNumber! > currentPage) continue;
        const headingOnPage = (headingsByPage.get(entry.pageNumber!) ?? []).some((text) => titlesMatch(text, entry.title));
        if (entry.pageNumber! < currentPage || !headingOnPage) openOutline(entry, currentPage);
      }
    }

    if (block.kind === "heading") {
      const entry = entries.find((e) => !e.opened && Math.abs(e.pageNumber! - block.page) <= 1 && titlesMatch(block.text, e.title));
      if (entry) openOutline(entry, block.page);
      else openHeading(block.text, block.level, block.page);
      continue;
    }

    const parent = top();
    if (block.kind === "box") {
      const box = node(block.title, parent.level + 1, parent, block.page, "box", null, false);
      box.blocks.push(...block.blocks.filter((b) => b.kind !== "heading"));
      box.pageEnd = block.pageEnd ?? block.page;
      continue;
    }
    parent.blocks.push(block);
  }

  finalise(root, pageCount);
  return strip(root);
}

function blockTokens(block: Block): number {
  switch (block.kind) {
    case "paragraph":
      return estimateTokens(block.text);
    case "list":
      return estimateTokens(block.items.join("\n"));
    case "table":
      return estimateTokens(block.markdown);
    case "figure":
      return estimateTokens(block.description);
    case "box":
      return block.blocks.reduce((sum, b) => sum + blockTokens(b), 0);
    default:
      return 0;
  }
}

function lastPage(block: Block): number {
  return "pageEnd" in block && block.pageEnd ? block.pageEnd : block.page;
}

/** Page ranges and token counts, bottom-up. A node ends where the next begins. */
function finalise(root: SectionNode, pageCount: number) {
  function walk(node: SectionNode): void {
    node.ownTokenCount = node.blocks.reduce((sum, block) => sum + blockTokens(block), 0);
    for (const child of node.children) walk(child);
    const pages = [node.pageStart, ...node.blocks.map(lastPage), ...node.children.map((c) => c.pageEnd)];
    node.pageEnd = Math.max(...pages);
    const firstContent = [...node.blocks.map((b) => b.page), ...node.children.map((c) => c.pageStart)];
    if (node.kind !== "report" && firstContent.length) node.pageStart = Math.min(node.pageStart, ...firstContent);
    node.tokenCount = node.ownTokenCount + node.children.reduce((sum, child) => sum + child.tokenCount, 0);
  }
  walk(root);
  root.pageStart = 1;
  root.pageEnd = Math.max(root.pageEnd, pageCount);
}

function strip(node: SectionNode): SectionNode {
  const { key, title, level, ordinal, path, kind, pageStart, pageEnd, blocks, regions, retrievable, ownTokenCount, tokenCount } = node;
  return { key, title, level, ordinal, path, kind, pageStart, pageEnd, blocks, regions, retrievable, ownTokenCount, tokenCount, children: node.children.map(strip) };
}

/** Depth-first, document order. */
export function flattenTree(root: SectionNode): SectionNode[] {
  return [root, ...root.children.flatMap(flattenTree)];
}

/** Indented outline for `pnpm tree` — check it against the PDF's contents page. */
export function renderTree(root: SectionNode): string {
  const lines: string[] = [];
  for (const node of flattenTree(root)) {
    if (node.level === 0) continue;
    const pages = node.pageStart === node.pageEnd ? `p.${node.pageStart}` : `pp.${node.pageStart}–${node.pageEnd}`;
    const flags = [node.kind !== "section" ? node.kind : "", node.regions.length ? node.regions.join(",") : "", node.retrievable ? "" : "excluded"].filter(Boolean).join(" · ");
    lines.push(`${"  ".repeat(node.level - 1)}${node.title}  (${pages}, ${node.tokenCount} tok${flags ? ` · ${flags}` : ""})`);
  }
  return lines.join("\n");
}
