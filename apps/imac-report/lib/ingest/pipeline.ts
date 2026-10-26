import type { Embedder } from "@pod/ai";
import type { Sql } from "@pod/db";
import { configHash } from "@pod/rag/hash";
import { CONFIG, DOCUMENT, type Representation, type StrategyId } from "../config";
import { activateRun, completeRun, createRun, deleteRun, failRun, findRun, upsertDocument } from "../db/runs";
import { insertChunks, insertElements, insertLinks, insertPages, verifyRunVectors } from "../db/write";
import type { ExtractionResult } from "../extract/run";
import { buildFlatChunks, buildTypedChunks, buildVariantVocab } from "../represent/build";
import type { RenderedPage } from "../types";
import { pageImagePath, publishAssets } from "./assets";

/**
 * One ingestion run = (strategy, representation): elements (with crops and
 * footnote links) plus derived chunks with embeddings (03 §Presets).
 *   X0:flat → M0 · X1:flat → M1 · <chosen>:typed → M2–M5
 * Same input + config = no-op unless forced; failures never go active.
 */
export async function ingest(
  { sql, embedder }: { sql: Sql; embedder: Embedder },
  {
    representation,
    extraction,
    pages,
    documentSha,
    activate = false,
    force = false,
    publish = true,
    log = console.log,
  }: {
    representation: Representation;
    extraction: ExtractionResult;
    pages: RenderedPage[];
    documentSha: string;
    activate?: boolean;
    force?: boolean;
    publish?: boolean;
    log?: (line: string) => void;
  },
) {
  const strategy: StrategyId = extraction.strategy;
  const variantVocab = buildVariantVocab(extraction.elements);
  const chunks =
    representation === "typed"
      ? buildTypedChunks(extraction.elements, extraction.links, variantVocab)
      : buildFlatChunks(extraction.elements);

  const config = {
    strategy,
    representation,
    chunk: CONFIG.chunk,
    embedding: { model: embedder.model, dims: embedder.dimensions },
    overrides: extraction.overridesApplied,
    content: configHash(extraction.elements.map((e) => [e.key, e.type, e.bbox, "text" in e ? e.text : "", e.section])),
  };
  const hash = configHash(config);

  const documentId = await upsertDocument(sql, { title: DOCUMENT.title, filename: DOCUMENT.filename, sha256: documentSha, pageCount: pages.length });
  const existing = await findRun(sql, documentId, hash);
  if (existing?.status === "completed" && !force) {
    log(`Run ${existing.id.slice(0, 8)} (${strategy}:${representation}) already exists — nothing to do.`);
    if (activate && !existing.isActive) await activateRun(sql, existing.id);
    return { runId: existing.id, skipped: true };
  }
  if (existing) await deleteRun(sql, existing.id);

  const runId = await createRun(sql, { documentId, strategy, representation, configHash: hash, config, embeddingModel: embedder.model, embeddingDims: embedder.dimensions });
  log(`Run ${runId.slice(0, 8)} (${strategy}:${representation}) started.`);

  try {
    const crops = publish ? await publishAssets(pages, extraction.elements, { log }) : new Map<string, string>();
    const pageIds = await insertPages(sql, runId, pages.map((p) => ({ page: p.page, imagePath: pageImagePath(p.page), width: p.width, height: p.height })));
    const elementIds = await insertElements(sql, runId, extraction.elements, pageIds, crops);
    await insertLinks(sql, extraction.links, elementIds);

    log(`  ${extraction.elements.length} elements, ${extraction.links.length} footnote links, ${chunks.length} chunks; embedding…`);
    const vectors = await embedder.embedDocuments(chunks.map((c) => c.embedText), { onProgress: (d, t) => log(`  embedded ${d}/${t}`) });
    await insertChunks(sql, runId, chunks, vectors, elementIds);

    const check = await verifyRunVectors(sql, runId);
    if (check.chunks !== chunks.length || check.missing > 0 || check.maxNormError > 1e-3) {
      throw new Error(`Verification failed: ${check.chunks}/${chunks.length} rows, ${check.missing} missing vectors.`);
    }

    const byType: Record<string, number> = {};
    for (const e of extraction.elements) byType[e.type] = (byType[e.type] ?? 0) + 1;
    const byKind: Record<string, number> = {};
    for (const c of chunks) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
    const stats = {
      elements: extraction.elements.length,
      byType,
      chunks: chunks.length,
      byKind,
      footnoteLinks: extraction.links.length,
      unresolvedMarkers: extraction.unresolved.length,
      fidelityFlags: extraction.elements.filter((e) => e.fidelity?.flags.length).length,
      crops: crops.size,
      variants: variantVocab,
    };
    await completeRun(sql, runId, stats);
    if (activate) await activateRun(sql, runId);
    log(`Run ${runId.slice(0, 8)} completed${activate ? " and activated" : ""}.`);
    return { runId, skipped: false, stats };
  } catch (error) {
    await failRun(sql, runId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
