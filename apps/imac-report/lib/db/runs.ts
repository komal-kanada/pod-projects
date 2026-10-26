import type { Sql } from "@pod/db";
import type { Representation, StrategyId } from "../config";
import type { IngestionRun, RunKey } from "../types";

/** Runs per (strategy, representation); one active of each, so presets coexist. */
interface RunRow {
  id: string;
  strategy: StrategyId;
  representation: Representation;
  config: Record<string, unknown>;
  embedding_model: string;
  embedding_dims: number;
  status: IngestionRun["status"];
  stats: Record<string, unknown> | null;
  is_active: boolean;
  created_at: Date;
}

const toRun = (r: RunRow): IngestionRun => ({
  id: r.id,
  strategy: r.strategy,
  representation: r.representation,
  config: r.config,
  embeddingModel: r.embedding_model,
  embeddingDims: r.embedding_dims,
  status: r.status,
  stats: r.stats,
  isActive: r.is_active,
  createdAt: new Date(r.created_at).toISOString(),
});

export async function upsertDocument(sql: Sql, doc: { title: string; filename: string; sha256: string; pageCount: number }) {
  const [row] = await sql<{ id: string }[]>`
    insert into imac.documents (title, filename, sha256, page_count)
    values (${doc.title}, ${doc.filename}, ${doc.sha256}, ${doc.pageCount})
    on conflict (sha256) do update set title = excluded.title
    returning id
  `;
  return row.id;
}

export async function findRun(sql: Sql, documentId: string, configHash: string) {
  const [row] = await sql<RunRow[]>`select * from imac.ingestion_runs where document_id = ${documentId} and config_hash = ${configHash}`;
  return row ? toRun(row) : null;
}

export async function createRun(
  sql: Sql,
  run: { documentId: string; strategy: StrategyId; representation: Representation; configHash: string; config: unknown; embeddingModel: string; embeddingDims: number },
) {
  const [row] = await sql<{ id: string }[]>`
    insert into imac.ingestion_runs (document_id, strategy, representation, config_hash, config, embedding_model, embedding_dims)
    values (${run.documentId}, ${run.strategy}, ${run.representation}, ${run.configHash}, ${sql.json(run.config as never)}, ${run.embeddingModel}, ${run.embeddingDims})
    returning id
  `;
  return row.id;
}

export async function completeRun(sql: Sql, runId: string, stats: unknown) {
  await sql`update imac.ingestion_runs set status = 'completed', stats = ${sql.json(stats as never)}, completed_at = now() where id = ${runId}`;
}

export async function failRun(sql: Sql, runId: string, error: string) {
  await sql`update imac.ingestion_runs set status = 'failed', error = ${error.slice(0, 2000)}, is_active = false, completed_at = now() where id = ${runId}`;
}

export async function deleteRun(sql: Sql, runId: string) {
  await sql`delete from imac.ingestion_runs where id = ${runId}`;
}

export async function activateRun(sql: Sql, runId: string): Promise<IngestionRun> {
  return sql.begin(async (tx) => {
    const [target] = await tx<RunRow[]>`select * from imac.ingestion_runs where id = ${runId}`;
    if (!target) throw new Error(`No ingestion run ${runId}.`);
    if (target.status !== "completed") throw new Error(`Run ${runId} is ${target.status}; only completed runs can be activated.`);
    await tx`update imac.ingestion_runs set is_active = false where is_active and strategy = ${target.strategy} and representation = ${target.representation}`;
    const [row] = await tx<RunRow[]>`update imac.ingestion_runs set is_active = true where id = ${runId} returning *`;
    return toRun(row);
  });
}

export async function getActiveRuns(sql: Sql): Promise<Partial<Record<RunKey, IngestionRun>>> {
  const rows = await sql<RunRow[]>`select * from imac.ingestion_runs where is_active`;
  return Object.fromEntries(rows.map((r) => [`${r.strategy}:${r.representation}`, toRun(r)]));
}

export async function listRuns(sql: Sql): Promise<IngestionRun[]> {
  return (await sql<RunRow[]>`select * from imac.ingestion_runs order by created_at desc`).map(toRun);
}

export async function resolveRunId(sql: Sql, idOrPrefix: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`select id from imac.ingestion_runs where id::text like ${`${idOrPrefix}%`}`;
  if (rows.length !== 1) throw new Error(rows.length ? `"${idOrPrefix}" matches ${rows.length} runs.` : `No run matches "${idOrPrefix}".`);
  return rows[0].id;
}
