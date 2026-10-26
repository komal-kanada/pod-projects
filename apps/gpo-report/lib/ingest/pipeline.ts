import type { Embedder } from "@pod/ai";
import type { Sql } from "@pod/db";
import { configHash, sha256 } from "@pod/rag/hash";
import { DOCUMENT, ingestionConfig, RAG_CONFIG, type ChunkConfig } from "../config";
import { insertChunks, verifyRunVectors } from "../db/chunks";
import {
  activateRun,
  completeRun,
  createRun,
  deleteRun,
  failRun,
  findRun,
  upsertDocument,
} from "../db/runs";
import { prepareDocument } from "./prepare";
import type { SupplementEntry } from "./structure";

/**
 * The offline half of RAG: PDF → chunks → vectors → a new ingestion run.
 *
 * Runs are versioned by (document sha256, config hash). Re-running the same
 * file with the same config is a no-op unless forced, so ingestion is safe to
 * repeat. Any failure marks the run `failed` — never a half-filled active run.
 */
export async function ingest(
  { sql, embedder }: { sql: Sql; embedder: Embedder },
  {
    data,
    chunkConfig = RAG_CONFIG.chunk,
    supplement = [],
    activate = false,
    force = false,
    notes,
    log = console.log,
  }: {
    data: Uint8Array;
    chunkConfig?: ChunkConfig;
    supplement?: SupplementEntry[];
    activate?: boolean;
    force?: boolean;
    notes?: string;
    log?: (line: string) => void;
  },
) {
  const prepared = await prepareDocument(data, chunkConfig, supplement);
  log(`Parsed ${prepared.pageCount} pages → ${prepared.chunks.length} chunks (${prepared.structureSource} sections).`);

  const config = {
    ...ingestionConfig(chunkConfig),
    // Part of the run's identity: a changed outline is a different run.
    outlineSupplement: supplement,
    embedding: { ...RAG_CONFIG.embedding, model: embedder.model, dims: embedder.dimensions },
  };
  const hash = configHash(config);
  const documentId = await upsertDocument(sql, {
    title: DOCUMENT.title,
    filename: DOCUMENT.filename,
    sha256: sha256(data),
    pageCount: prepared.pageCount,
  });

  const existing = await findRun(sql, documentId, hash);
  if (existing && existing.status === "completed" && !force) {
    log(`Run ${existing.id.slice(0, 8)} already has this file and config — nothing to do (use --force to rebuild).`);
    if (activate && !existing.isActive) await activateRun(sql, existing.id);
    return { runId: existing.id, skipped: true, chunkCount: existing.chunkCount ?? 0 };
  }
  if (existing) await deleteRun(sql, existing.id);

  const runId = await createRun(sql, {
    documentId,
    configHash: hash,
    config,
    embeddingModel: embedder.model,
    embeddingDims: embedder.dimensions,
    notes,
  });
  log(`Run ${runId.slice(0, 8)} started (config ${hash}).`);

  try {
    const vectors = await embedder.embedDocuments(
      prepared.chunks.map((chunk) => chunk.embedText),
      { onProgress: (done, total) => log(`  embedded ${done}/${total}`) },
    );
    await insertChunks(sql, { runId, documentId, chunks: prepared.chunks, vectors });

    const check = await verifyRunVectors(sql, runId);
    if (check.chunks !== prepared.chunks.length || check.missing > 0 || check.maxNormError > 1e-3) {
      throw new Error(
        `Verification failed: ${check.chunks}/${prepared.chunks.length} rows, ${check.missing} missing vectors, max norm error ${check.maxNormError}.`,
      );
    }

    await completeRun(sql, runId, prepared.chunks.length, prepared.stats);
    if (activate) await activateRun(sql, runId);
    log(`Run ${runId.slice(0, 8)} completed${activate ? " and activated" : ""}.`);
    return { runId, skipped: false, chunkCount: prepared.chunks.length, stats: prepared.stats };
  } catch (error) {
    await failRun(sql, runId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
