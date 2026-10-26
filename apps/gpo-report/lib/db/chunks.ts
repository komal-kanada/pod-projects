import { toVector, type Sql } from "@pod/db";
import type { PreparedChunk, RetrievedChunk } from "../types";

/** Chunk storage and the two search functions (vector, hybrid). */

const INSERT_BATCH = 100;

/**
 * Inserts chunks in batches. Rows travel as one JSON document per batch and
 * are expanded with json_to_recordset, so the vector text is cast once in SQL
 * and a 500-chunk run is five round trips, not five hundred.
 */
export async function insertChunks(
  sql: Sql,
  { runId, documentId, chunks, vectors }: { runId: string; documentId: string; chunks: PreparedChunk[]; vectors: number[][] },
) {
  for (let start = 0; start < chunks.length; start += INSERT_BATCH) {
    const rows = chunks.slice(start, start + INSERT_BATCH).map((chunk, i) => ({
      chunk_index: chunk.index,
      content: chunk.content,
      embed_text: chunk.embedText,
      section_path: chunk.sectionPath || null,
      page_start: chunk.pageStart,
      page_end: chunk.pageEnd,
      page_label_start: chunk.pageLabelStart,
      page_label_end: chunk.pageLabelEnd,
      char_count: chunk.content.length,
      embedding: toVector(vectors[start + i]),
    }));

    await sql`
      insert into gpo.chunks (
        run_id, document_id, chunk_index, content, embed_text, section_path,
        page_start, page_end, page_label_start, page_label_end, char_count, embedding
      )
      select ${runId}::uuid, ${documentId}::uuid, r.chunk_index, r.content, r.embed_text, r.section_path,
             r.page_start, r.page_end, r.page_label_start, r.page_label_end, r.char_count,
             r.embedding::extensions.vector
      from json_to_recordset(${sql.json(rows as never)}::json) as r(
        chunk_index int, content text, embed_text text, section_path text,
        page_start int, page_end int, page_label_start text, page_label_end text,
        char_count int, embedding text
      )
    `;
  }
}

/** Ingestion check: rows, missing vectors, and the worst vector norm. */
export async function verifyRunVectors(sql: Sql, runId: string) {
  const [row] = await sql<{ chunks: number; missing: number; max_norm_error: number | null }[]>`
    select count(*)::int as chunks,
           count(*) filter (where embedding is null)::int as missing,
           max(abs(1 - extensions.vector_norm(embedding)))::float8 as max_norm_error
    from gpo.chunks where run_id = ${runId}
  `;
  return { chunks: row.chunks, missing: row.missing, maxNormError: row.max_norm_error ?? 0 };
}

interface SearchRow {
  chunk_id: string;
  chunk_index: number;
  content: string;
  section_path: string | null;
  page_start: number;
  page_end: number;
  page_label_start: string | null;
  page_label_end: string | null;
  similarity: number;
  vector_rank?: number | null;
  keyword_rank?: number | null;
  rrf_score?: number | null;
}

function toRetrieved(row: SearchRow, index: number): RetrievedChunk {
  return {
    rank: index + 1,
    chunkId: row.chunk_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    sectionPath: row.section_path,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    pageLabelStart: row.page_label_start,
    pageLabelEnd: row.page_label_end,
    similarity: Number(row.similarity),
    vectorRank: row.vector_rank ?? null,
    keywordRank: row.keyword_rank ?? null,
    rrfScore: row.rrf_score === undefined || row.rrf_score === null ? null : Number(row.rrf_score),
  };
}

export async function vectorSearch(sql: Sql, runId: string, embedding: number[], topK: number) {
  const rows = await sql<SearchRow[]>`
    select * from gpo.match_chunks(${toVector(embedding)}::extensions.vector, ${runId}::uuid, ${topK}::int)
  `;
  return rows.map(toRetrieved);
}

export async function hybridSearch(
  sql: Sql,
  runId: string,
  query: string,
  embedding: number[],
  { topK, candidatePool, rrfK }: { topK: number; candidatePool: number; rrfK: number },
) {
  const rows = await sql<SearchRow[]>`
    select * from gpo.hybrid_search(
      ${query}, ${toVector(embedding)}::extensions.vector, ${runId}::uuid,
      ${topK}::int, ${candidatePool}::int, ${rrfK}::int
    )
  `;
  return rows.map(toRetrieved);
}

export interface StoredChunk {
  id: string;
  chunkIndex: number;
  content: string;
  embedText: string;
  sectionPath: string | null;
  pageStart: number;
  pageEnd: number;
  pageLabelStart: string | null;
  pageLabelEnd: string | null;
  charCount: number;
}

/** Chunk browser: chunks covering a page, or matching text, in reading order. */
export async function listChunks(
  sql: Sql,
  runId: string,
  { page, q, limit = 50 }: { page?: number; q?: string; limit?: number },
): Promise<StoredChunk[]> {
  const rows = await sql<
    {
      id: string;
      chunk_index: number;
      content: string;
      embed_text: string;
      section_path: string | null;
      page_start: number;
      page_end: number;
      page_label_start: string | null;
      page_label_end: string | null;
      char_count: number;
    }[]
  >`
    select id, chunk_index, content, embed_text, section_path, page_start, page_end,
           page_label_start, page_label_end, char_count
    from gpo.chunks
    where run_id = ${runId}
      ${page !== undefined ? sql`and ${page} between page_start and page_end` : sql``}
      ${q ? sql`and content ilike ${`%${q}%`}` : sql``}
    order by chunk_index
    limit ${Math.min(Math.max(limit, 1), 200)}
  `;
  return rows.map((row) => ({
    id: row.id,
    chunkIndex: row.chunk_index,
    content: row.content,
    embedText: row.embed_text,
    sectionPath: row.section_path,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    pageLabelStart: row.page_label_start,
    pageLabelEnd: row.page_label_end,
    charCount: row.char_count,
  }));
}

export async function pageBounds(sql: Sql, runId: string) {
  const [row] = await sql<{ first: number | null; last: number | null }[]>`
    select min(page_start) as first, max(page_end) as last from gpo.chunks where run_id = ${runId}
  `;
  return { first: row.first ?? 1, last: row.last ?? 1 };
}
