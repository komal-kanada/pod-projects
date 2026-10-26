import { randomUUID } from "node:crypto";
import type { Embedder, Gemini } from "@pod/ai";
import type { Sql } from "@pod/db";
import { mapWithConcurrency } from "@pod/rag/concurrency";
import { createDiskCache } from "@pod/rag/disk-cache";
import { configHash, sha256 } from "@pod/rag/hash";
import { estimateTokens } from "@pod/rag/tokens";
import { buildFlatChunks } from "../chunking/flat";
import { collectTables, buildHierarchicalChunks } from "../chunking/hierarchical";
import { contextualHeader } from "../chunking/contextual-header";
import { CONFIG, DOCUMENT, type RunKind } from "../config";
import { insertChunks, verifyRunVectors } from "../db/chunks";
import { activateRun, completeRun, createRun, deleteRun, failRun, findRun, upsertDocument } from "../db/runs";
import { insertSections } from "../db/sections";
import { guessReportYear } from "../metadata/extract";
import { PARSE_PROMPT_VERSION, SUMMARY_PROMPT_VERSION, TABLE_LINE_PROMPT_VERSION, tableLinePrompt } from "../prompts";
import { summariseTree } from "../structure/summaries";
import { flattenTree, type OutlineItem } from "../structure/tree";
import type { ParsedReport, PreparedChunk } from "../types";
import { buildDocument } from "./prepare";

/**
 * Builds one ingestion run of a given kind (03 §Presets):
 *
 * - `flat:text`     — B0: text layer, fixed-size chunks
 * - `flat:markdown` — B1: Gemini markdown, fixed-size chunks
 * - `hierarchical`  — B2–B6: section tree, child/table/figure chunks with
 *                     metadata, optional summary nodes (B6)
 *
 * Same input + same config = no-op unless forced. Failures mark the run
 * `failed`; it never becomes active half-built.
 */
export interface IngestOptions {
  kind: RunKind;
  parsed: ParsedReport;
  /** Section skeleton; defaults to the PDF bookmarks. */
  outline?: OutlineItem[];
  summaries?: boolean;
  activate?: boolean;
  force?: boolean;
  log?: (line: string) => void;
}

export async function ingest(
  { sql, embedder, gemini }: { sql: Sql; embedder: Embedder; gemini?: Gemini },
  { kind, parsed, outline = parsed.outline, summaries = false, activate = false, force = false, log = console.log }: IngestOptions,
) {
  const reportYear = guessReportYear(parsed.textPages.slice(0, 6).join("\n"));
  const structured = buildDocument(parsed, kind === "flat:text" ? "text" : "markdown", outline);
  const tree = kind === "flat:text" ? buildDocument(parsed, "markdown", outline).tree : structured.tree;

  const useLlm = Boolean(gemini) && kind === "hierarchical";
  const config = {
    kind,
    chunk: kind === "hierarchical" ? { child: CONFIG.chunk.child, tableMaxChars: CONFIG.chunk.tableMaxChars } : CONFIG.chunk.flat,
    embedding: { model: embedder.model, dims: embedder.dimensions },
    parsePrompt: kind === "flat:text" ? null : PARSE_PROMPT_VERSION,
    tableLines: useLlm ? TABLE_LINE_PROMPT_VERSION : "deterministic",
    summaries: kind === "hierarchical" && summaries ? SUMMARY_PROMPT_VERSION : null,
    reportYear,
  };
  const hash = configHash({
    ...config,
    source: sha256(JSON.stringify([parsed.textPages, parsed.markdownPages])).slice(0, 16),
    outline: sha256(JSON.stringify(outline)).slice(0, 16),
  });

  const documentId = await upsertDocument(sql, { title: DOCUMENT.title, filename: DOCUMENT.filename, sha256: parsed.sha256, pageCount: parsed.pageCount });
  const existing = await findRun(sql, documentId, hash);
  if (existing?.status === "completed" && !force) {
    log(`Run ${existing.id.slice(0, 8)} (${kind}) already exists for this input and config — nothing to do.`);
    if (activate && !existing.isActive) await activateRun(sql, existing.id);
    return { runId: existing.id, skipped: true };
  }
  if (existing) await deleteRun(sql, existing.id);

  const runId = await createRun(sql, { documentId, kind, configHash: hash, config, embeddingModel: embedder.model, embeddingDims: embedder.dimensions });
  log(`Run ${runId.slice(0, 8)} (${kind}) started.`);

  try {
    let chunks: PreparedChunk[];
    const sectionIds = new Map<string, string>();
    let summaryMap = new Map<string, string>();

    if (kind === "hierarchical") {
      const tableLines = gemini ? await describeTables(gemini, collectTables(tree), log) : undefined;
      chunks = buildHierarchicalChunks(tree, {
        pageLabels: parsed.pageLabels,
        reportYear,
        parseSourceForPage: (page) => structured.pageSource[page - 1] ?? "text_layer",
        tableLines,
      });
      if (summaries) {
        if (!gemini) throw new Error("Summaries need GEMINI_API_KEY.");
        summaryMap = await summariseTree(gemini, tree, { cacheDir: DOCUMENT.cacheDir, log });
        chunks = [...chunks, ...summaryChunks(tree, summaryMap, parsed.pageLabels, chunks.length)];
      }
      for (const node of flattenTree(tree)) sectionIds.set(node.key, randomUUID());
      await insertSections(sql, runId, tree, sectionIds, summaryMap);
    } else {
      const pages = parsed.textPages.map((text, i) => {
        const md = kind === "flat:markdown" ? parsed.markdownPages[i] : null;
        return { text: md ?? text, source: md ? ("gemini" as const) : ("text_layer" as const) };
      });
      chunks = buildFlatChunks(pages, { pageLabels: parsed.pageLabels, reportYear, tree });
    }

    log(`  ${chunks.length} chunks; embedding with ${embedder.model}…`);
    const vectors = await embedder.embedDocuments(chunks.map((c) => c.embedText), {
      onProgress: (done, total) => log(`  embedded ${done}/${total}`),
    });
    await insertChunks(sql, { runId, chunks, vectors, sectionIds });

    const check = await verifyRunVectors(sql, runId);
    if (check.chunks !== chunks.length || check.missing > 0 || check.maxNormError > 1e-3) {
      throw new Error(`Verification failed: ${check.chunks}/${chunks.length} rows, ${check.missing} missing vectors.`);
    }

    const stats = runStats(chunks, tree, structured.pageSource);
    await completeRun(sql, runId, stats);
    if (activate) await activateRun(sql, runId);
    log(`Run ${runId.slice(0, 8)} completed${activate ? " and activated" : ""}.`);
    return { runId, skipped: false, stats };
  } catch (error) {
    await failRun(sql, runId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/** One-line LLM descriptions of each table, cached on disk by table content. */
async function describeTables(gemini: Gemini, tables: ReturnType<typeof collectTables>, log: (line: string) => void) {
  const cache = createDiskCache(`${DOCUMENT.cacheDir}/table-lines`);
  const lines = new Map<string, string>();
  await mapWithConcurrency(tables, 4, async (table) => {
    const key = `${sha256(table.markdown).slice(0, 20)}-${TABLE_LINE_PROMPT_VERSION}`;
    const cached = await cache.get<{ line: string }>(key);
    if (cached) {
      lines.set(table.markdown, cached.line);
      return;
    }
    try {
      const line = (await gemini.generateText({ prompt: tableLinePrompt(table.caption ?? "", table.markdown), temperature: 0, maxOutputTokens: 80 })).split("\n")[0];
      lines.set(table.markdown, line);
      await cache.set(key, { line });
    } catch (error) {
      log(`  table line failed (${table.caption ?? `p.${table.page}`}): ${(error as Error).message}`);
    }
  });
  log(`  described ${lines.size}/${tables.length} tables`);
  return lines;
}

function summaryChunks(tree: ReturnType<typeof buildDocument>["tree"], summaries: Map<string, string>, pageLabels: string[], offset: number): PreparedChunk[] {
  return flattenTree(tree)
    .filter((node) => summaries.has(node.key))
    .map((node, i) => {
      const content = summaries.get(node.key)!;
      const labelStart = pageLabels[node.pageStart - 1] || String(node.pageStart);
      const labelEnd = pageLabels[node.pageEnd - 1] || String(node.pageEnd);
      const header = contextualHeader({ path: node.path, regions: node.regions, type: "summary", pageStart: labelStart, pageEnd: labelEnd });
      return {
        index: offset + i,
        sectionKey: node.key,
        ordinalInSection: null,
        contentType: "summary" as const,
        title: node.title,
        content,
        embedText: `${header}\n${content}`,
        sectionPath: node.path,
        chapter: node.path[0] ?? null,
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        pageLabelStart: labelStart,
        pageLabelEnd: labelEnd,
        parseSource: "gemini" as const,
        tokenCount: estimateTokens(content),
        regions: node.regions,
        countries: [],
        years: [],
        isForecast: false,
      };
    });
}

function runStats(chunks: PreparedChunk[], tree: ReturnType<typeof buildDocument>["tree"], pageSource: string[]) {
  const byType: Record<string, number> = {};
  for (const chunk of chunks) byType[chunk.contentType] = (byType[chunk.contentType] ?? 0) + 1;
  return {
    chunks: chunks.length,
    byType,
    sections: flattenTree(tree).length - 1,
    fallbackPages: pageSource.map((s, i) => (s === "text_layer" ? i + 1 : 0)).filter(Boolean).length,
    avgTokens: Math.round(chunks.reduce((sum, c) => sum + c.tokenCount, 0) / Math.max(1, chunks.length)),
    withRegions: chunks.filter((c) => c.regions.length).length,
    forecastChunks: chunks.filter((c) => c.isForecast).length,
  };
}
