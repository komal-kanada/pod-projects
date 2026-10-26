import { toVector, type Sql } from "@pod/db";
import { elementMarkdown, elementTitle } from "../represent/markdown";
import type { DerivedChunk, Element, FootnoteLink } from "../types";

/** Writes one run's pages, elements, footnote links and chunks, in batches. */

export async function insertPages(sql: Sql, runId: string, pages: { page: number; imagePath: string; width: number; height: number }[]) {
  const rows = pages.map((p) => ({ page_number: p.page, image_path: p.imagePath, width: p.width, height: p.height }));
  const inserted = await sql<{ id: string; page_number: number }[]>`
    insert into imac.pages (run_id, page_number, image_path, width, height)
    select ${runId}::uuid, r.page_number, r.image_path, r.width, r.height
    from json_to_recordset(${sql.json(rows as never)}::json) as r(page_number int, image_path text, width int, height int)
    returning id, page_number
  `;
  return new Map(inserted.map((r) => [r.page_number, r.id]));
}

function elementData(element: Element): Record<string, unknown> | null {
  if (element.type === "table") {
    return { columns: element.columns, rows: element.rows, rowHeaderCols: element.rowHeaderCols, unit: element.unit ?? null, notes: element.notes ?? null };
  }
  if (element.type === "chart") {
    return { chartType: element.chartType, unit: element.unit ?? null, xLabel: element.xLabel ?? null, yLabel: element.yLabel ?? null, series: element.series, description: element.description };
  }
  if (element.type === "callout") return { figure: element.figure ?? null, iconMeaning: element.iconMeaning ?? null };
  if (element.type === "heading") return { level: element.level };
  return null;
}

function elementText(element: Element): string | null {
  switch (element.type) {
    case "text":
    case "heading":
    case "footnote":
    case "callout":
      return element.text;
    case "image":
      return element.description;
    case "chart":
      return element.description;
    default:
      return null;
  }
}

export async function insertElements(
  sql: Sql,
  runId: string,
  elements: Element[],
  pageIds: Map<number, string>,
  cropPaths: Map<string, string>,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (let start = 0; start < elements.length; start += 100) {
    const rows = elements.slice(start, start + 100).map((e) => ({
      page_id: pageIds.get(e.page),
      element_key: e.key,
      page_number: e.page,
      reading_order: e.order,
      type: e.type,
      bbox: e.bbox,
      crop_path: cropPaths.get(e.key) ?? null,
      title: elementTitle(e),
      section: e.section ?? null,
      text: elementText(e),
      data: elementData(e),
      markdown: elementMarkdown(e),
      marker: e.type === "footnote" ? e.marker : null,
      fidelity: e.fidelity ?? null,
      overridden: Boolean(e.overridden),
    }));
    const inserted = await sql<{ id: string; element_key: string }[]>`
      insert into imac.elements (run_id, page_id, element_key, page_number, reading_order, type, bbox, crop_path,
        title, section, text, data, markdown, marker, fidelity, overridden)
      select ${runId}::uuid, r.page_id, r.element_key, r.page_number, r.reading_order, r.type, r.bbox, r.crop_path,
             r.title, r.section, r.text, r.data, r.markdown, r.marker, r.fidelity, r.overridden
      from json_to_recordset(${sql.json(rows as never)}::json) as r(
        page_id uuid, element_key text, page_number int, reading_order int, type text, bbox int[], crop_path text,
        title text, section text, text text, data jsonb, markdown text, marker text, fidelity jsonb, overridden boolean
      )
      returning id, element_key
    `;
    for (const row of inserted) ids.set(row.element_key, row.id);
  }
  return ids;
}

export async function insertLinks(sql: Sql, links: FootnoteLink[], ids: Map<string, string>) {
  const rows = links
    .map((l) => ({ element_id: ids.get(l.elementKey), footnote_id: ids.get(l.footnoteKey), marker: l.marker }))
    .filter((r) => r.element_id && r.footnote_id);
  if (rows.length === 0) return;
  await sql`
    insert into imac.footnote_links (element_id, footnote_id, marker)
    select r.element_id, r.footnote_id, r.marker
    from json_to_recordset(${sql.json(rows as never)}::json) as r(element_id uuid, footnote_id uuid, marker text)
    on conflict do nothing
  `;
}

export async function insertChunks(sql: Sql, runId: string, chunks: DerivedChunk[], vectors: number[][], ids: Map<string, string>) {
  for (let start = 0; start < chunks.length; start += 100) {
    const rows = chunks.slice(start, start + 100).map((c, i) => ({
      element_id: c.elementKey ? ids.get(c.elementKey) ?? null : null,
      chunk_kind: c.kind,
      element_type: c.elementType,
      content: c.content,
      embed_text: c.embedText,
      fts_text: c.ftsText,
      page_number: c.page,
      section: c.section,
      variants: c.variants,
      phases: c.phases,
      units: c.units,
      has_numbers: c.hasNumbers,
      ordinal: c.ordinal,
      embedding: toVector(vectors[start + i]),
    }));
    await sql`
      insert into imac.chunks (run_id, element_id, chunk_kind, element_type, content, embed_text, fts_text, page_number,
        section, variants, phases, units, has_numbers, ordinal, embedding)
      select ${runId}::uuid, r.element_id, r.chunk_kind, r.element_type, r.content, r.embed_text, r.fts_text, r.page_number,
             r.section, r.variants, r.phases, r.units, r.has_numbers, r.ordinal, r.embedding::extensions.vector
      from json_to_recordset(${sql.json(rows as never)}::json) as r(
        element_id uuid, chunk_kind text, element_type text, content text, embed_text text, fts_text text, page_number int,
        section text, variants text[], phases text[], units text[], has_numbers boolean, ordinal int, embedding text
      )
    `;
  }
}

export async function verifyRunVectors(sql: Sql, runId: string) {
  const [row] = await sql<{ chunks: number; missing: number; max_norm_error: number | null }[]>`
    select count(*)::int as chunks, count(*) filter (where embedding is null)::int as missing,
           max(abs(1 - extensions.vector_norm(embedding)))::float8 as max_norm_error
    from imac.chunks where run_id = ${runId}
  `;
  return { chunks: row.chunks, missing: row.missing, maxNormError: row.max_norm_error ?? 0 };
}
