import type { Sql } from "@pod/db";
import type { RunKind } from "../config";
import type { IngestionRun } from "../types";

/**
 * Ingestion runs. One run is active per kind (flat:text, flat:markdown,
 * hierarchical), so every preset B0–B6 can answer at the same time.
 */
interface RunRow {
  id: string;
  document_id: string;
  kind: RunKind;
  config_hash: string;
  config: Record<string, unknown>;
  embedding_model: string;
  embedding_dims: number;
  status: IngestionRun["status"];
  stats: Record<string, unknown> | null;
  is_active: boolean;
  notes: string | null;
  created_at: Date;
}

function toRun(row: RunRow): IngestionRun {
  return {
    id: row.id,
    documentId: row.document_id,
    kind: row.kind,
    configHash: row.config_hash,
    config: row.config,
    embeddingModel: row.embedding_model,
    embeddingDims: row.embedding_dims,
    status: row.status,
    stats: row.stats,
    isActive: row.is_active,
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function upsertDocument(sql: Sql, doc: { title: string; filename: string; sha256: string; pageCount: number }) {
  const [row] = await sql<{ id: string }[]>`
    insert into worldbank.documents (title, filename, sha256, page_count)
    values (${doc.title}, ${doc.filename}, ${doc.sha256}, ${doc.pageCount})
    on conflict (sha256) do update set title = excluded.title
    returning id
  `;
  return row.id;
}

export async function findRun(sql: Sql, documentId: string, configHash: string) {
  const [row] = await sql<RunRow[]>`
    select * from worldbank.ingestion_runs where document_id = ${documentId} and config_hash = ${configHash}
  `;
  return row ? toRun(row) : null;
}

export async function createRun(
  sql: Sql,
  run: { documentId: string; kind: RunKind; configHash: string; config: unknown; embeddingModel: string; embeddingDims: number },
) {
  const [row] = await sql<{ id: string }[]>`
    insert into worldbank.ingestion_runs (document_id, kind, config_hash, config, embedding_model, embedding_dims)
    values (${run.documentId}, ${run.kind}, ${run.configHash}, ${sql.json(run.config as never)}, ${run.embeddingModel}, ${run.embeddingDims})
    returning id
  `;
  return row.id;
}

export async function completeRun(sql: Sql, runId: string, stats: unknown) {
  await sql`
    update worldbank.ingestion_runs set status = 'completed', stats = ${sql.json(stats as never)}, completed_at = now()
    where id = ${runId}
  `;
}

export async function failRun(sql: Sql, runId: string, error: string) {
  await sql`
    update worldbank.ingestion_runs set status = 'failed', error = ${error.slice(0, 2000)}, is_active = false, completed_at = now()
    where id = ${runId}
  `;
}

export async function deleteRun(sql: Sql, runId: string) {
  await sql`delete from worldbank.ingestion_runs where id = ${runId}`;
}

/** Makes a completed run the active one for its kind, atomically. */
export async function activateRun(sql: Sql, runId: string): Promise<IngestionRun> {
  return sql.begin(async (tx) => {
    const [target] = await tx<RunRow[]>`select * from worldbank.ingestion_runs where id = ${runId}`;
    if (!target) throw new Error(`No ingestion run ${runId}.`);
    if (target.status !== "completed") throw new Error(`Run ${runId} is ${target.status}; only completed runs can be activated.`);
    await tx`update worldbank.ingestion_runs set is_active = false where is_active and kind = ${target.kind}`;
    const [row] = await tx<RunRow[]>`update worldbank.ingestion_runs set is_active = true where id = ${runId} returning *`;
    return toRun(row);
  });
}

export async function getActiveRuns(sql: Sql): Promise<Partial<Record<RunKind, IngestionRun>>> {
  const rows = await sql<RunRow[]>`select * from worldbank.ingestion_runs where is_active`;
  return Object.fromEntries(rows.map((row) => [row.kind, toRun(row)]));
}

export async function getRun(sql: Sql, runId: string): Promise<IngestionRun | null> {
  const [row] = await sql<RunRow[]>`select * from worldbank.ingestion_runs where id = ${runId}`;
  return row ? toRun(row) : null;
}

export async function listRuns(sql: Sql): Promise<IngestionRun[]> {
  return (await sql<RunRow[]>`select * from worldbank.ingestion_runs order by created_at desc`).map(toRun);
}

export async function resolveRunId(sql: Sql, idOrPrefix: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`select id from worldbank.ingestion_runs where id::text like ${`${idOrPrefix}%`}`;
  if (rows.length !== 1) throw new Error(rows.length ? `"${idOrPrefix}" matches ${rows.length} runs.` : `No run matches "${idOrPrefix}".`);
  return rows[0].id;
}
