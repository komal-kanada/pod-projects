import { estimateTokens } from "@pod/rag/tokens";
import type { SectionChild } from "../db/chunks";
import type { Candidate, ContentType, ContextSource } from "../types";
import { PATH_SEPARATOR, pageLabel } from "../types";

/**
 * Context assembly (06 §6) — "index small, answer big":
 *
 * 1. Expand: a child chunk becomes its whole leaf section when that is small
 *    enough (≤ parentMaxTokens), otherwise a window of neighbouring children
 *    grown alternately before/after. Tables and figures stay as they are.
 * 2. Merge: two children of one section become one block; overlapping or
 *    adjacent windows join.
 * 3. Dedupe: a table inside an included whole section isn't repeated.
 * 4. Budget: blocks go in by score until the token budget; a block that
 *    doesn't fit shrinks to its best child; tables are all-or-nothing.
 * 5. Order: grouped by chapter, document order inside — reads like the
 *    report and avoids "lost in the middle" from score-ordered shuffles.
 *
 * Pure function: all data is passed in, so it is unit-tested directly.
 */
export interface SectionInfo {
  id: string;
  path: string[];
  title: string;
  ordinal: number;
  ownText: string | null;
  ownTokenCount: number;
  pageStart: number;
  pageEnd: number;
}

export interface RankedCandidate extends Candidate {
  /** Final score used for budgeting (rerank or fusion). */
  finalScore: number;
}

interface Block {
  key: string;
  sectionId: string | null;
  path: string[];
  type: ContentType;
  title: string | null;
  whole: boolean;
  ordinals: number[];
  chunkIds: Set<string>;
  score: number;
  sectionOrdinal: number;
  text: string;
  pageStart: number;
  pageEnd: number;
  labelStart: string;
  labelEnd: string;
  /** Best single member, for shrinking. */
  best: RankedCandidate;
}

export interface AssembledContext {
  sources: ContextSource[];
  context: string;
  stats: { blocks: number; merged: number; tokens: number; budget: number; dropped: { title: string; tokens: number }[]; shrunk: number };
}

function attr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function candidateBlock(c: RankedCandidate, sectionOrdinal: number): Block {
  return {
    key: `chunk:${c.chunkId}`,
    sectionId: c.sectionId,
    path: c.sectionPath,
    type: c.contentType,
    title: c.title,
    whole: false,
    ordinals: c.ordinalInSection === null ? [] : [c.ordinalInSection],
    chunkIds: new Set([c.chunkId]),
    score: c.finalScore,
    sectionOrdinal,
    text: c.content,
    pageStart: c.pageStart,
    pageEnd: c.pageEnd,
    labelStart: c.pageLabelStart ?? String(c.pageStart),
    labelEnd: c.pageLabelEnd ?? String(c.pageEnd),
    best: c,
  };
}

function textFromChildren(kids: SectionChild[]): Pick<Block, "text" | "pageStart" | "pageEnd" | "labelStart" | "labelEnd"> {
  const first = kids.reduce((a, b) => (b.pageStart < a.pageStart ? b : a));
  const last = kids.reduce((a, b) => (b.pageEnd > a.pageEnd ? b : a));
  return {
    text: kids.map((k) => k.content).join("\n\n"),
    pageStart: first.pageStart,
    pageEnd: last.pageEnd,
    labelStart: first.pageLabelStart ?? String(first.pageStart),
    labelEnd: last.pageLabelEnd ?? String(last.pageEnd),
  };
}

export function assembleContext({
  final,
  mode,
  sections,
  children,
  parentMaxTokens,
  budget,
}: {
  final: RankedCandidate[];
  mode: "raw" | "smallToBig";
  sections: Map<string, SectionInfo>;
  children: Map<string, SectionChild[]>;
  parentMaxTokens: number;
  budget: number;
}): AssembledContext {
  const sectionOrdinal = (id: string | null) => (id ? sections.get(id)?.ordinal ?? 0 : 0);

  if (mode === "raw") {
    const blocks = final.map((c) => candidateBlock(c, sectionOrdinal(c.sectionId)));
    return format(blocks, { merged: 0, dropped: [], shrunk: 0, budget });
  }

  // 1. Expand.
  const expanded: Block[] = final.map((c) => {
    const base = candidateBlock(c, sectionOrdinal(c.sectionId));
    if (!c.sectionId || (c.contentType !== "text" && c.contentType !== "box") || c.ordinalInSection === null) return base;
    const section = sections.get(c.sectionId);
    const kids = (children.get(c.sectionId) ?? []).filter((k) => k.contentType === "text" || k.contentType === "box");
    if (!section || kids.length === 0) return base;

    if (section.ownText && section.ownTokenCount <= parentMaxTokens) {
      const all = children.get(c.sectionId) ?? kids;
      return {
        ...base,
        ...textFromChildren(all),
        key: `whole:${c.sectionId}`,
        whole: true,
        text: section.ownText,
        ordinals: all.map((k) => k.ordinal),
      };
    }

    // Window: grow alternately before and after the hit.
    const index = kids.findIndex((k) => k.ordinal === c.ordinalInSection);
    if (index === -1) return base;
    let lo = index;
    let hi = index;
    let tokens = kids[index].tokenCount;
    let growBefore = true;
    while (tokens < parentMaxTokens && (lo > 0 || hi < kids.length - 1)) {
      if ((growBefore && lo > 0) || hi >= kids.length - 1) {
        if (tokens + kids[lo - 1].tokenCount > parentMaxTokens) break;
        lo -= 1;
        tokens += kids[lo].tokenCount;
      } else {
        if (tokens + kids[hi + 1].tokenCount > parentMaxTokens) break;
        hi += 1;
        tokens += kids[hi].tokenCount;
      }
      growBefore = !growBefore;
    }
    const window = kids.slice(lo, hi + 1);
    return { ...base, ...textFromChildren(window), key: `win:${c.sectionId}`, ordinals: window.map((k) => k.ordinal) };
  });

  // 2–3. Merge and dedupe per section.
  const merged: Block[] = [];
  let mergeCount = 0;
  const bySection = new Map<string, Block[]>();
  for (const block of expanded) {
    if (!block.sectionId) {
      merged.push(block);
      continue;
    }
    bySection.set(block.sectionId, [...(bySection.get(block.sectionId) ?? []), block]);
  }

  for (const [sectionId, blocks] of bySection) {
    const whole = blocks.find((b) => b.whole);
    if (whole) {
      for (const other of blocks) {
        if (other === whole) continue;
        other.chunkIds.forEach((id) => whole.chunkIds.add(id));
        if (other.score > whole.score) {
          whole.score = other.score;
          whole.best = other.best;
        }
        mergeCount += 1;
      }
      merged.push(whole);
      continue;
    }

    const standalone = blocks.filter((b) => !b.key.startsWith("win:"));
    const windows = blocks.filter((b) => b.key.startsWith("win:")).sort((a, b) => a.ordinals[0] - b.ordinals[0]);
    const runs: Block[] = [];
    for (const window of windows) {
      const last = runs.at(-1);
      if (last && window.ordinals[0] <= last.ordinals.at(-1)! + 1) {
        const ordinals = [...new Set([...last.ordinals, ...window.ordinals])].sort((a, b) => a - b);
        const kids = (children.get(sectionId) ?? []).filter((k) => ordinals.includes(k.ordinal));
        Object.assign(last, textFromChildren(kids), { ordinals });
        window.chunkIds.forEach((id) => last.chunkIds.add(id));
        if (window.score > last.score) {
          last.score = window.score;
          last.best = window.best;
        }
        mergeCount += 1;
      } else {
        runs.push({ ...window, key: `win:${sectionId}:${window.ordinals[0]}` });
      }
    }
    merged.push(...runs, ...standalone);
  }

  // 4. Budget, best first.
  const kept: Block[] = [];
  const dropped: { title: string; tokens: number }[] = [];
  let used = 0;
  let shrunk = 0;
  for (const block of [...merged].sort((a, b) => b.score - a.score)) {
    let candidate = block;
    let tokens = estimateTokens(candidate.text);
    if (used + tokens > budget && candidate.type !== "table" && candidate.ordinals.length > 1) {
      candidate = { ...candidateBlock(block.best, block.sectionOrdinal), score: block.score, chunkIds: block.chunkIds };
      tokens = estimateTokens(candidate.text);
      shrunk += 1;
    }
    if (used + tokens > budget) {
      dropped.push({ title: block.title ?? block.path.join(PATH_SEPARATOR), tokens });
      continue;
    }
    used += tokens;
    kept.push(candidate);
  }

  // 5. Order: chapters by their best block, document order within a chapter.
  const chapterRank = new Map<string, number>();
  kept.forEach((block) => {
    const chapter = block.path[0] ?? "";
    if (!chapterRank.has(chapter)) chapterRank.set(chapter, chapterRank.size);
  });
  kept.sort(
    (a, b) =>
      chapterRank.get(a.path[0] ?? "")! - chapterRank.get(b.path[0] ?? "")! ||
      a.sectionOrdinal - b.sectionOrdinal ||
      (a.ordinals[0] ?? 0) - (b.ordinals[0] ?? 0) ||
      a.pageStart - b.pageStart,
  );

  return format(kept, { merged: mergeCount, dropped, shrunk, budget });
}

function format(
  blocks: Block[],
  { merged, dropped, shrunk, budget }: { merged: number; dropped: { title: string; tokens: number }[]; shrunk: number; budget: number },
): AssembledContext {
  const sources: ContextSource[] = blocks.map((block, i) => ({
    n: i + 1,
    sectionId: block.sectionId,
    sectionPath: block.path,
    contentType: block.type,
    title: block.whole ? null : block.title,
    pageStart: block.pageStart,
    pageEnd: block.pageEnd,
    pageLabel: pageLabel(block.labelStart, block.labelEnd),
    tokens: estimateTokens(block.text),
    chunkIds: [...block.chunkIds],
    score: block.score,
    text: block.text,
  }));

  const context = sources
    .map((s) => {
      const pages = s.pageLabel.replace(/^p\. /, "");
      const title = s.title && s.contentType !== "text" ? ` title="${attr(s.title)}"` : "";
      const body = s.text.replace(/<\/source>/gi, "</ source>");
      return `<source id="${s.n}" section="${attr(s.sectionPath.join(PATH_SEPARATOR) || "—")}" pages="${attr(pages)}" type="${s.contentType}"${title}>\n${body}\n</source>`;
    })
    .join("\n");

  return {
    sources,
    context,
    stats: { blocks: sources.length, merged, tokens: sources.reduce((sum, s) => sum + s.tokens, 0), budget, dropped, shrunk },
  };
}
