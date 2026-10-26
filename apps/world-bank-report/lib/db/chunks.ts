import { toVector, type Sql } from "@pod/db";
import { CONFIG, type SearchMode } from "../config";
import type { Candidate, ContentType, PreparedChunk, QueryFilters } from "../types";

/** Chunk storage, search and the reads context assembly needs. */

export async function insertChunks(
  sql: Sql,
  { runId, chunks, vectors, sectionIds }: { runId: string; chunks: PreparedChunk[]; vectors: number[][]; sectionIds: Map<string, string> },
) {
  for (let start = 0; start < chunks.length; start += 100) {
    const rows = chunks.slice(start, start + 100).map((c, i) => ({
      section_id: c.sectionKey ? sectionIds.get(c.sectionKey) ?? null : null,
      chunk_index: c.index,
      ordinal_in_section: c.ordinalInSection,
      content_type: c.contentType,
      title: c.title,
      content: c.content,
      embed_text: c.embedText,
      section_path: c.sectionPath,
      chapter: c.chapter,
      page_start: c.pageStart,
      page_end: c.pageEnd,
      page_label_start: c.pageLabelStart,
      page_label_end: c.pageLabelEnd,
      regions: c.regions,
      countries: c.countries,
      years: c.years,
      is_forecast: c.isForecast,
      parse_source: c.parseSource,
      token_count: c.tokenCount,
      embedding: toVector(vectors[start + i]),
    }));
    await sql`
      insert into worldbank.chunks (run_id, section_id, chunk_index, ordinal_in_section, content_type, title, content,
        embed_text, section_path, chapter, page_start, page_end, page_label_start, page_label_end, regions, countries,
        years, is_forecast, parse_source, token_count, embedding)
      select ${runId}::uuid, r.section_id, r.chunk_index, r.ordinal_in_section, r.content_type, r.title, r.content,
             r.embed_text, r.section_path, r.chapter, r.page_start, r.page_end, r.page_label_start, r.page_label_end,
             r.regions, r.countries, r.years, r.is_forecast, r.parse_source, r.token_count, r.embedding::extensions.vector
      from json_to_recordset(${sql.json(rows as never)}::json) as r(
        section_id uuid, chunk_index int, ordinal_in_section int, content_type text, title text, content text,
        embed_text text, section_path text[], chapter text, page_start int, page_end int, page_label_start text,
        page_label_end text, regions text[], countries text[], years int[], is_forecast boolean, parse_source text,
        token_count int, embedding text
      )
    `;
  }
}

export async function verifyRunVectors(sql: Sql, runId: string) {
  const [row] = await sql<{ chunks: number; missing: number; max_norm_error: number | null }[]>`
    select count(*)::int as chunks, count(*) filter (where embedding is null)::int as missing,
           max(abs(1 - extensions.vector_norm(embedding)))::float8 as max_norm_error
    from worldbank.chunks where run_id = ${runId}
  `;
  return { chunks: row.chunks, missing: row.missing, maxNormError: row.max_norm_error ?? 0 };
}

interface SearchRow {
  chunk_id: string; section_id: string | null; content_type: ContentType; title: string | null; content: string;
  section_path: string[] | null; chapter: string | null; page_start: number; page_end: number;
  page_label_start: string | null; page_label_end: string | null; regions: string[]; countries: string[]; years: number[];
  is_forecast: boolean; token_count: number; ordinal_in_section: number | null;
  similarity: number | null; vector_rank: number | null; keyword_rank: number | null; score: number;
}

function toCandidate(row: SearchRow): Candidate {
  return {
    chunkId: row.chunk_id,
    sectionId: row.section_id,
    contentType: row.content_type,
    title: row.title,
    content: row.content,
    sectionPath: row.section_path ?? [],
    chapter: row.chapter,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    pageLabelStart: row.page_label_start,
    pageLabelEnd: row.page_label_end,
    regions: row.regions,
    countries: row.countries,
    years: row.years,
    isForecast: row.is_forecast,
    tokenCount: row.token_count,
    ordinalInSection: row.ordinal_in_section,
    similarity: row.similarity === null ? null : Number(row.similarity),
    vectorRank: row.vector_rank,
    keywordRank: row.keyword_rank,
    score: Number(row.score),
  };
}

export async function searchChunks(
  sql: Sql,
  {
    runId,
    query,
    embedding,
    mode,
    filters = {},
    sectionIds = null,
    pool = CONFIG.retrieval.candidatePool,
  }: {
    runId: string;
    query: string;
    embedding: number[];
    mode: SearchMode;
    filters?: QueryFilters;
    sectionIds?: string[] | null;
    pool?: number;
  },
): Promise<Candidate[]> {
  const rows = await sql<SearchRow[]>`
    select * from worldbank.hybrid_search(
      ${runId}::uuid, ${query}, ${toVector(embedding)}::extensions.vector, ${mode}, ${pool}::int, ${CONFIG.retrieval.rrfK}::int,
      ${filters.contentTypes ?? null}::text[], ${filters.regions ?? null}::text[], ${filters.countries ?? null}::text[],
      ${filters.years ?? null}::int[], ${filters.chapter ?? null}::text, ${sectionIds}::uuid[]
    )
  `;
  return rows.map(toCandidate);
}

export async function matchSummaries(sql: Sql, runId: string, embedding: number[], count: number) {
  return sql<{ section_id: string; path: string[]; summary: string; similarity: number }[]>`
    select * from worldbank.match_summaries(${runId}::uuid, ${toVector(embedding)}::extensions.vector, ${count}::int)
  `;
}

export interface SectionChild {
  chunkId: string;
  sectionId: string;
  ordinal: number;
  contentType: ContentType;
  title: string | null;
  content: string;
  tokenCount: number;
  pageStart: number;
  pageEnd: number;
  pageLabelStart: string | null;
  pageLabelEnd: string | null;
}

export async function sectionChildren(sql: Sql, sectionIds: string[]): Promise<SectionChild[]> {
  if (sectionIds.length === 0) return [];
  const rows = await sql<
    { chunk_id: string; section_id: string; ordinal_in_section: number; content_type: ContentType; title: string | null;
      content: string; token_count: number; page_start: number; page_end: number; page_label_start: string | null; page_label_end: string | null }[]
  >`select * from worldbank.get_section_children(${sectionIds}::uuid[])`;
  return rows.map((r) => ({
    chunkId: r.chunk_id, sectionId: r.section_id, ordinal: r.ordinal_in_section, contentType: r.content_type,
    title: r.title, content: r.content, tokenCount: r.token_count, pageStart: r.page_start, pageEnd: r.page_end,
    pageLabelStart: r.page_label_start, pageLabelEnd: r.page_label_end,
  }));
}

export interface BrowsedChunk {
  id: string;
  chunkIndex: number;
  contentType: ContentType;
  title: string | null;
  content: string;
  embedText: string;
  sectionPath: string[];
  pageStart: number;
  pageEnd: number;
  pageLabelStart: string | null;
  pageLabelEnd: string | null;
  regions: string[];
  countries: string[];
  years: number[];
  isForecast: boolean;
  parseSource: string;
  tokenCount: number;
}

export async function listChunks(
  sql: Sql,
  runId: string,
  { sectionId, page, type, q, limit = 50 }: { sectionId?: string; page?: number; type?: string; q?: string; limit?: number },
): Promise<BrowsedChunk[]> {
  const rows = await sql<
    { id: string; chunk_index: number; content_type: ContentType; title: string | null; content: string; embed_text: string;
      section_path: string[] | null; page_start: number; page_end: number; page_label_start: string | null; page_label_end: string | null;
      regions: string[]; countries: string[]; years: number[]; is_forecast: boolean; parse_source: string; token_count: number }[]
  >`
    select id, chunk_index, content_type, title, content, embed_text, section_path, page_start, page_end,
           page_label_start, page_label_end, regions, countries, years, is_forecast, parse_source, token_count
    from worldbank.chunks
    where run_id = ${runId}
      ${sectionId ? sql`and section_id = ${sectionId}` : sql``}
      ${page !== undefined ? sql`and ${page} between page_start and page_end` : sql``}
      ${type ? sql`and content_type = ${type}` : sql``}
      ${q ? sql`and content ilike ${`%${q}%`}` : sql``}
    order by chunk_index
    limit ${Math.min(Math.max(limit, 1), 200)}
  `;
  return rows.map((r) => ({
    id: r.id, chunkIndex: r.chunk_index, contentType: r.content_type, title: r.title, content: r.content,
    embedText: r.embed_text, sectionPath: r.section_path ?? [], pageStart: r.page_start, pageEnd: r.page_end,
    pageLabelStart: r.page_label_start, pageLabelEnd: r.page_label_end, regions: r.regions, countries: r.countries,
    years: r.years, isForecast: r.is_forecast, parseSource: r.parse_source, tokenCount: r.token_count,
  }));
}
