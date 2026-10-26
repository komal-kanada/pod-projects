import { binaryPart, textPart, type Gemini } from "@pod/ai";
import { createDiskCache } from "@pod/rag/disk-cache";
import { mapWithConcurrency } from "@pod/rag/concurrency";
import { sha256 } from "@pod/rag/hash";
import { PDFDocument } from "pdf-lib";
import { CONFIG } from "../config";
import { pageFidelity, type PageFidelity } from "./fidelity";
import { PARSE_PROMPT_VERSION, parsePrompt } from "../prompts";

/**
 * Gemini reads the pages *as pages* — layout, tables as tables, boxes,
 * figures — and writes markdown (04 §3). Pages go in small PDFs of ~5 pages
 * split with pdf-lib, three batches in flight.
 *
 * Every page's markdown is cached on disk by (file hash, page, prompt
 * version, model), so a re-run only pays for pages that changed or failed,
 * and a crash halfway through resumes where it stopped.
 *
 * Each page is then checked against the text layer; a failing page is
 * re-parsed once on its own, and if it still fails, the text layer is used
 * for that page (`parse_source = text_layer`).
 */

export interface PageMarkdownResult {
  markdownPages: (string | null)[];
  fidelity: PageFidelity[];
  fallbackPages: number[];
  reparsedPages: number[];
}

/** Splits "<<<PAGE n>>>" sections; pages the model skipped come back undefined. */
export function splitPages(output: string, first: number, last: number): Map<number, string> {
  const pages = new Map<number, string>();
  const parts = output.split(/<<<\s*PAGE\s+(\d+)\s*>>>/i);
  for (let i = 1; i < parts.length; i += 2) {
    const n = Number(parts[i]);
    if (n >= first && n <= last) {
      const body = parts[i + 1].trim();
      pages.set(n, body === "(no text)" ? "" : body);
    }
  }
  return pages;
}

async function extractPages(source: PDFDocument, pages: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const copied = await out.copyPages(source, pages.map((p) => p - 1));
  copied.forEach((page) => out.addPage(page));
  return out.save();
}

export async function parsePagesToMarkdown(
  gemini: Gemini,
  {
    data,
    textPages,
    cacheDir,
    pages: only,
    force = false,
    log = console.log,
  }: {
    data: Uint8Array;
    textPages: string[];
    cacheDir: string;
    /** Restrict to these 1-based pages (e.g. --pages 40-45). */
    pages?: number[];
    force?: boolean;
    log?: (line: string) => void;
  },
): Promise<PageMarkdownResult> {
  const cache = createDiskCache(`${cacheDir}/markdown`);
  const fileHash = sha256(data).slice(0, 16);
  const model = CONFIG.parse.model;
  const key = (page: number) => `p${String(page).padStart(3, "0")}-${fileHash}-${PARSE_PROMPT_VERSION}-${model}`;

  const source = await PDFDocument.load(data, { ignoreEncryption: true });
  const pageCount = source.getPageCount();
  const wanted = (only ?? Array.from({ length: pageCount }, (_, i) => i + 1)).filter((p) => p >= 1 && p <= pageCount);

  const markdown = new Map<number, string>();
  const todo: number[] = [];
  for (const page of wanted) {
    const cached = force ? null : await cache.get<{ markdown: string }>(key(page));
    if (cached) markdown.set(page, cached.markdown);
    else todo.push(page);
  }
  log(`Page markdown: ${markdown.size} cached, ${todo.length} to parse with ${model}.`);

  async function parseBatch(pages: number[]): Promise<Map<number, string>> {
    const first = pages[0];
    const last = pages.at(-1)!;
    const pdf = await extractPages(source, pages);
    const output = await gemini.generateText({
      prompt: [textPart(parsePrompt(first, last)), binaryPart(pdf, "application/pdf")],
      temperature: 0,
      maxOutputTokens: 32768,
      model,
    });
    return splitPages(output, first, last);
  }

  // Contiguous batches of up to N pages.
  const batches: number[][] = [];
  for (const page of todo) {
    const batch = batches.at(-1);
    if (batch && batch.length < CONFIG.parse.pagesPerBatch && batch.at(-1)! + 1 === page) batch.push(page);
    else batches.push([page]);
  }

  let done = 0;
  await mapWithConcurrency(batches, CONFIG.parse.concurrency, async (batch) => {
    try {
      const result = await parseBatch(batch);
      for (const page of batch) {
        const body = result.get(page);
        if (body !== undefined) {
          markdown.set(page, body);
          await cache.set(key(page), { markdown: body });
        }
      }
    } catch (error) {
      log(`  batch ${batch[0]}–${batch.at(-1)} failed: ${(error as Error).message}`);
    }
    done += batch.length;
    log(`  parsed ${done}/${todo.length}`);
  });

  // Fidelity, with one single-page retry for failures (and pages the model skipped).
  const fidelity: PageFidelity[] = [];
  const fallbackPages: number[] = [];
  const reparsedPages: number[] = [];
  const thresholds = { minNumericPrecision: CONFIG.parse.minNumericPrecision, minCoverage: CONFIG.parse.minCoverage };

  for (const page of wanted) {
    const layer = textPages[page - 1] ?? "";
    let body = markdown.get(page);
    let check = body === undefined ? null : pageFidelity(page, body, layer, thresholds);

    if (!check?.ok && !reparsedPages.includes(page)) {
      reparsedPages.push(page);
      try {
        const retry = (await parseBatch([page])).get(page);
        if (retry !== undefined) {
          const retryCheck = pageFidelity(page, retry, layer, thresholds);
          if (!check || retryCheck.numericPrecision + retryCheck.coverage > check.numericPrecision + check.coverage) {
            body = retry;
            check = retryCheck;
            markdown.set(page, retry);
            await cache.set(key(page), { markdown: retry });
          }
        }
      } catch (error) {
        log(`  re-parse of page ${page} failed: ${(error as Error).message}`);
      }
    }

    if (!check) check = { page, numbers: 0, numericPrecision: 0, coverage: 0, unmatchedNumbers: [], ok: false };
    fidelity.push(check);
    if (!check.ok) fallbackPages.push(page);
  }

  const markdownPages: (string | null)[] = Array.from({ length: pageCount }, (_, i) => {
    const page = i + 1;
    if (fallbackPages.includes(page)) return null;
    return markdown.get(page) ?? null;
  });

  return { markdownPages, fidelity, fallbackPages, reparsedPages };
}
