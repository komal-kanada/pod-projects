import { toVector, type Sql } from "@pod/db";
import { CONFIG, type SearchMode } from "../config";
import type { BBox, ChunkHit, ElementType, LinkedFootnote, StoredElement } from "../types";

/** Search and the reads that expansion, Explorer and Inspect need. */

export async function searchElements(
  sql: Sql,
  args: { runId: string; query: string; embedding: number[]; mode: SearchMode; boostKinds: string[] | null; variants: string[] | null; pool?: number },
): Promise<ChunkHit[]> {
  const rows = await sql<
    { chunk_id: string; element_id: string | null; chunk_kind: ChunkHit["kind"]; element_type: ElementType | null; content: string; page_number: number;
      section: string | null; variants: string[]; similarity: number | null; vector_rank: number | null; keyword_rank: number | null; score: number }[]
  >`
    select * from imac.hybrid_search_elements(
      ${args.runId}::uuid, ${args.query}, ${toVector(args.embedding)}::extensions.vector, ${args.mode},
      ${args.pool ?? CONFIG.retrieval.candidatePool}::int, ${CONFIG.retrieval.rrfK}::int,
      ${args.boostKinds}::text[], ${CONFIG.retrieval.typeBoost}::float8, ${args.variants}::text[]
    )
  `;
  return rows.map((r) => ({
    chunkId: r.chunk_id,
    elementId: r.element_id,
    kind: r.chunk_kind,
    elementType: r.element_type,
    content: r.content,
    page: r.page_number,
    section: r.section,
    variants: r.variants,
    similarity: r.similarity === null ? null : Number(r.similarity),
    vectorRank: r.vector_rank,
    keywordRank: r.keyword_rank,
    score: Number(r.score),
  }));
}

interface ElementRow {
  id: string;
  element_key: string;
  page_number: number;
  reading_order: number;
  type: ElementType;
  bbox: number[] | null;
  crop_path: string | null;
  title: string | null;
  section: string | null;
  text: string | null;
  data: Record<string, unknown> | null;
  markdown: string | null;
  marker: string | null;
  fidelity?: StoredElement["fidelity"];
  overridden?: boolean;
}

const toElement = (r: ElementRow): StoredElement => ({
  id: r.id,
  key: r.element_key,
  page: r.page_number,
  order: r.reading_order,
  type: r.type,
  bbox: (r.bbox as BBox | null) ?? null,
  cropPath: r.crop_path,
  title: r.title,
  section: r.section,
  text: r.text,
  data: r.data,
  markdown: r.markdown,
  marker: r.marker,
  fidelity: r.fidelity ?? null,
  overridden: r.overridden ?? false,
});

export async function elementsWithFootnotes(sql: Sql, ids: string[]): Promise<Map<string, { element: StoredElement; footnotes: LinkedFootnote[] }>> {
  if (ids.length === 0) return new Map();
  const rows = await sql<{ element: ElementRow; footnotes: LinkedFootnote[] }[]>`
    select * from imac.get_elements_with_footnotes(${ids}::uuid[])
  `;
  return new Map(rows.map((r) => [r.element.id, { element: toElement(r.element), footnotes: r.footnotes }]));
}

export async function footnoteReferrers(sql: Sql, footnoteIds: string[]): Promise<Map<string, string[]>> {
  if (footnoteIds.length === 0) return new Map();
  const rows = await sql<{ footnote_id: string; element_id: string }[]>`select * from imac.footnote_referrers(${footnoteIds}::uuid[])`;
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.footnote_id, [...(map.get(r.footnote_id) ?? []), r.element_id]);
  return map;
}

/** Text chunks in reading order for an element (to add the next one to short hits). */
export async function nextTextElement(sql: Sql, runId: string, elementId: string): Promise<StoredElement | null> {
  const [row] = await sql<ElementRow[]>`
    select e2.* from imac.elements e1
    join imac.elements e2 on e2.run_id = e1.run_id
      and (e2.page_number, e2.reading_order) > (e1.page_number, e1.reading_order)
    where e1.id = ${elementId} and e2.run_id = ${runId} and e2.type = 'text'
    order by e2.page_number, e2.reading_order
    limit 1
  `;
  return row ? toElement(row) : null;
}

export async function listPages(sql: Sql, runId: string) {
  const pages = await sql<{ page_number: number; image_path: string; width: number; height: number }[]>`
    select page_number, image_path, width, height from imac.pages where run_id = ${runId} order by page_number
  `;
  const elements = await sql<ElementRow[]>`
    select id, element_key, page_number, reading_order, type, bbox, crop_path, title, section, text, data, markdown, marker, fidelity, overridden
    from imac.elements where run_id = ${runId} order by page_number, reading_order
  `;
  const byPage = new Map<number, StoredElement[]>();
  for (const e of elements.map(toElement)) byPage.set(e.page, [...(byPage.get(e.page) ?? []), e]);
  return pages.map((p) => ({ page: p.page_number, imagePath: p.image_path, width: p.width, height: p.height, elements: byPage.get(p.page_number) ?? [] }));
}

export async function elementDetail(sql: Sql, id: string) {
  const [row] = await sql<(ElementRow & { run_id: string })[]>`select * from imac.elements where id = ${id}`;
  if (!row) return null;
  const chunks = await sql<{ id: string; chunk_kind: string; content: string; variants: string[]; phases: string[]; units: string[] }[]>`
    select id, chunk_kind, content, variants, phases, units from imac.chunks where element_id = ${id} order by ordinal
  `;
  const footnotes = await sql<{ id: string; marker: string; text: string; page_number: number }[]>`
    select f.id, l.marker, f.text, f.page_number from imac.footnote_links l join imac.elements f on f.id = l.footnote_id where l.element_id = ${id}
  `;
  const referencedBy = await sql<{ id: string; type: string; title: string | null; page_number: number }[]>`
    select e.id, e.type, e.title, e.page_number from imac.footnote_links l join imac.elements e on e.id = l.element_id where l.footnote_id = ${id}
  `;
  return { element: toElement(row), runId: row.run_id, chunks, footnotes, referencedBy };
}

export async function variantVocab(sql: Sql, runId: string): Promise<string[]> {
  const rows = await sql<{ v: string }[]>`select distinct unnest(variants) as v from imac.chunks where run_id = ${runId}`;
  return rows.map((r) => r.v).sort((a, b) => b.length - a.length);
}
