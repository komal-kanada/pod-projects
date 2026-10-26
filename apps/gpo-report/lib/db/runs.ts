import type { Sql } from "@pod/db";
import type { IngestionRun } from "../types";

/**
 * Ingestion runs and documents. A run is one (document, config) pair; at most
 * one is active, and the app answers only from the active run.
 */

interface RunRow {
  id: string;
  document_id: string;
  config_hash: string;
  config: unknown;
  embedding_model: string;
  embedding_dims: number;
  status: IngestionRun["status"];
  chunk_count: number | null;
  stats: Record<string, unknown> | null;
  is_active: boolean;
  notes: string | null;
  created_at: Date;
  completed_at: Date | null;
}

function toRun(row: RunRow): IngestionRun {
  return {
    id: row.id,
    documentId: row.document_id,
    configHash: row.config_hash,
    config: row.config,
    embeddingModel: row.embedding_model,
    embeddingDims: row.embedding_dims,
    status: row.status,
    chunkCount: row.chunk_count,
    stats: row.stats,
    isActive: row.is_active,
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

export async function upsertDocument(
  sql: Sql,
  doc: { title: string; filename: string; sha256: string; pageCount: number },
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into gpo.documents (title, filename, sha256, page_count)
    values (${doc.title}, ${doc.filename}, ${doc.sha256}, ${doc.pageCount})
    on conflict (sha256) do update set title = excluded.title
    returning id
  `;
  return row.id;
}

export async function findRun(sql: Sql, documentId: string, configHash: string) {
  const [row] = await sql<RunRow[]>`
    select * from gpo.ingestion_runs
    where document_id = ${documentId} and config_hash = ${configHash}
  `;
  return row ? toRun(row) : null;
}

export async function createRun(
  sql: Sql,
  run: { documentId: string; configHash: string; config: unknown; embeddingModel: string; embeddingDims: number; notes?: string },
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into gpo.ingestion_runs (document_id, config_hash, config, embedding_model, embedding_dims, notes)
    values (${run.documentId}, ${run.configHash}, ${sql.json(run.config as never)},
            ${run.embeddingModel}, ${run.embeddingDims}, ${run.notes ?? null})
    returning id
  `;
  return row.id;
}

export async function completeRun(sql: Sql, runId: string, chunkCount: number, stats: unknown) {
  await sql`
    update gpo.ingestion_runs
    set status = 'completed', chunk_count = ${chunkCount}, stats = ${sql.json(stats as never)}, completed_at = now()
    where id = ${runId}
  `;
}

export async function failRun(sql: Sql, runId: string, error: string) {
  await sql`
    update gpo.ingestion_runs
    set status = 'failed', error = ${error.slice(0, 2000)}, is_active = false, completed_at = now()
    where id = ${runId}
  `;
}

export async function deleteRun(sql: Sql, runId: string) {
  await sql`delete from gpo.ingestion_runs where id = ${runId}`;
}

/** Switches the active run atomically; only completed runs can be active. */
export async function activateRun(sql: Sql, runId: string): Promise<IngestionRun> {
  return sql.begin(async (tx) => {
    const [target] = await tx<RunRow[]>`select * from gpo.ingestion_runs where id = ${runId}`;
    if (!target) throw new Error(`No ingestion run ${runId}.`);
    if (target.status !== "completed") {
      throw new Error(`Run ${runId} is ${target.status}; only completed runs can be activated.`);
    }
    await tx`update gpo.ingestion_runs set is_active = false where is_active`;
    const [row] = await tx<RunRow[]>`
      update gpo.ingestion_runs set is_active = true where id = ${runId} returning *
    `;
    return toRun(row);
  });
}

export async function getActiveRun(sql: Sql): Promise<IngestionRun | null> {
  const [row] = await sql<RunRow[]>`select * from gpo.ingestion_runs where is_active limit 1`;
  return row ? toRun(row) : null;
}

export async function getRun(sql: Sql, runId: string): Promise<IngestionRun | null> {
  const [row] = await sql<RunRow[]>`select * from gpo.ingestion_runs where id = ${runId}`;
  return row ? toRun(row) : null;
}

export async function listRuns(sql: Sql): Promise<IngestionRun[]> {
  const rows = await sql<RunRow[]>`select * from gpo.ingestion_runs order by created_at desc`;
  return rows.map(toRun);
}

/** Accepts a full id or the short prefix printed by the CLIs. */
export async function resolveRunId(sql: Sql, idOrPrefix: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    select id from gpo.ingestion_runs where id::text like ${`${idOrPrefix}%`}
  `;
  if (rows.length === 0) throw new Error(`No ingestion run matches "${idOrPrefix}".`);
  if (rows.length > 1) throw new Error(`"${idOrPrefix}" matches ${rows.length} runs; use more characters.`);
  return rows[0].id;
}
