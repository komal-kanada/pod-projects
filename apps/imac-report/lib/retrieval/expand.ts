import type { Sql } from "@pod/db";
import { elementsWithFootnotes, footnoteReferrers, nextTextElement } from "../db/read";
import type { ChunkHit, LinkedFootnote, StoredElement } from "../types";

/**
 * Ranked chunks → ranked whole elements (06 §4). A table-row hit brings the
 * whole table (hit rows marked); a chart fact brings the whole chart; a
 * footnote brings itself and the element that references it; a short text
 * hit brings the next paragraph. Linked footnotes always come along as Notes.
 */
export interface ExpandedElement {
  element: StoredElement | null;
  /** For flat runs: the chunk itself stands in for an element. */
  flat?: ChunkHit;
  footnotes: LinkedFootnote[];
  score: number;
  chunkIds: string[];
  hitRows: number[];
  referencedBy?: string | null;
}

/** Which body rows of a table a row sentence ("… for <label>, …") points at. */
export function hitRowsFor(element: StoredElement, hits: ChunkHit[]): number[] {
  const rows = (element.data?.rows as string[][] | undefined) ?? [];
  const headerCols = Math.max(1, Number(element.data?.rowHeaderCols ?? 1));
  const indexes = new Set<number>();
  for (const hit of hits) {
    if (hit.kind !== "table_row") continue;
    const label = hit.content.match(/: for (.+?), [^,]+ is /)?.[1];
    if (!label) continue;
    rows.forEach((row, i) => {
      if (row.slice(0, headerCols).filter(Boolean).join(", ") === label) indexes.add(i);
    });
  }
  return [...indexes].sort((a, b) => a - b);
}

export async function expandHits(sql: Sql, runId: string, hits: ChunkHit[]): Promise<ExpandedElement[]> {
  const flat = hits.filter((h) => !h.elementId);
  if (flat.length === hits.length) {
    return flat.map((hit) => ({ element: null, flat: hit, footnotes: [], score: hit.score, chunkIds: [hit.chunkId], hitRows: [] }));
  }

  const byElement = new Map<string, ChunkHit[]>();
  for (const hit of hits) if (hit.elementId) byElement.set(hit.elementId, [...(byElement.get(hit.elementId) ?? []), hit]);

  const footnoteHits = [...byElement.entries()].filter(([, hs]) => hs.some((h) => h.kind === "footnote")).map(([id]) => id);
  const referrers = await footnoteReferrers(sql, footnoteHits);
  const referrerIds = [...new Set([...referrers.values()].map((ids) => ids[0]).filter(Boolean))];

  const loaded = await elementsWithFootnotes(sql, [...new Set([...byElement.keys(), ...referrerIds])]);
  const expanded: ExpandedElement[] = [];

  for (const [id, elementHits] of byElement) {
    const entry = loaded.get(id);
    if (!entry) continue;
    const score = Math.max(...elementHits.map((h) => h.score));
    const referrerId = referrers.get(id)?.[0];
    const referrer = referrerId ? loaded.get(referrerId)?.element : null;
    expanded.push({
      element: entry.element,
      footnotes: entry.footnotes,
      score,
      chunkIds: elementHits.map((h) => h.chunkId),
      hitRows: entry.element.type === "table" ? hitRowsFor(entry.element, elementHits) : [],
      referencedBy: referrer ? `${referrer.title ?? referrer.type} (p. ${referrer.page})` : null,
    });

    // A footnote's referencing element joins, just below it.
    if (referrer && !byElement.has(referrer.id)) {
      const ref = loaded.get(referrer.id)!;
      expanded.push({ element: ref.element, footnotes: ref.footnotes, score: score * 0.9, chunkIds: [], hitRows: [] });
    }

    // A very short text hit reads better with the paragraph after it.
    if (entry.element.type === "text" && (entry.element.text ?? "").length < 300) {
      const next = await nextTextElement(sql, runId, entry.element.id);
      if (next && !byElement.has(next.id)) expanded.push({ element: next, footnotes: [], score: score * 0.8, chunkIds: [], hitRows: [] });
    }
  }

  // Deduplicate (an element can arrive as a hit and as a referrer).
  const seen = new Map<string, ExpandedElement>();
  for (const item of expanded.sort((a, b) => b.score - a.score)) {
    const key = item.element!.id;
    const prior = seen.get(key);
    if (!prior) seen.set(key, item);
    else prior.chunkIds = [...new Set([...prior.chunkIds, ...item.chunkIds])];
  }
  return [...seen.values()];
}
