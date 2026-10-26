/**
 * `pnpm parse [--pages 40-45] [--force] [--text-only]`
 *
 * Text layer + outline + page labels, then Gemini page → markdown (cached
 * per page, resumable), then the fidelity check against the text layer.
 * Writes data/cache/parsed.json and data/cache/fidelity.json.
 * --text-only skips Gemini (enough for preset B0).
 */
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createGemini, FALLBACK_MODELS, SCRIPT_RETRY } from "@pod/ai";
import { requireEnv } from "@pod/rag/app-env";
import { sha256 } from "@pod/rag/hash";
import { DOCUMENT } from "../lib/config";
import { parsePagesToMarkdown } from "../lib/parse/page-markdown";
import { loadParsed, saveParsed } from "../lib/parse/store";
import { readTextLayer } from "../lib/parse/text-layer";
import type { ParsedReport } from "../lib/types";

const { values } = parseArgs({
  options: {
    pages: { type: "string" },
    force: { type: "boolean", default: false },
    "text-only": { type: "boolean", default: false },
  },
});

function pageList(spec: string | undefined): number[] | undefined {
  if (!spec) return undefined;
  return spec.split(",").flatMap((part) => {
    const [a, b] = part.split("-").map((n) => Number.parseInt(n, 10));
    return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a];
  });
}

const data = new Uint8Array(await readFile(DOCUMENT.path));
const layer = await readTextLayer(data);
console.log(`${DOCUMENT.path}: ${layer.pageCount} pages, ${layer.outline.length} outline entries, ${layer.cleanStats.repeatedLinesRemoved} header/footer lines removed.`);

let previous: ParsedReport | null = null;
try {
  previous = await loadParsed();
} catch {
  previous = null;
}
const fileHash = sha256(data);

const parsed: ParsedReport = {
  sha256: fileHash,
  pageCount: layer.pageCount,
  pageLabels: layer.pageLabels,
  outline: layer.outline,
  textPages: layer.textPages,
  markdownPages: previous?.sha256 === fileHash ? previous.markdownPages : Array(layer.pageCount).fill(null),
  parseSource: previous?.sha256 === fileHash ? previous.parseSource : Array(layer.pageCount).fill("text_layer"),
};

if (!values["text-only"]) {
  const { geminiApiKey } = requireEnv("geminiApiKey");
  const gemini = createGemini({ apiKey: geminiApiKey!, retry: SCRIPT_RETRY, fallbackModels: FALLBACK_MODELS });
  const only = pageList(values.pages);
  const result = await parsePagesToMarkdown(gemini, { data, textPages: layer.textPages, cacheDir: DOCUMENT.cacheDir, pages: only, force: values.force });

  for (const page of only ?? result.markdownPages.map((_, i) => i + 1)) {
    parsed.markdownPages[page - 1] = result.markdownPages[page - 1];
    parsed.parseSource[page - 1] = result.markdownPages[page - 1] === null ? "text_layer" : "gemini";
  }

  await writeFile(`${DOCUMENT.cacheDir}/fidelity.json`, JSON.stringify(result.fidelity, null, 2));
  const ok = result.fidelity.filter((f) => f.ok).length;
  console.log(`\nFidelity: ${ok}/${result.fidelity.length} pages pass (precision ≥ 0.98, coverage ≥ 0.90).`);
  console.log(`Re-parsed: ${result.reparsedPages.join(", ") || "none"}`);
  console.log(`Text-layer fallback: ${result.fallbackPages.join(", ") || "none"}  ← check these by hand`);
  const worst = [...result.fidelity].sort((a, b) => a.numericPrecision - b.numericPrecision).slice(0, 5);
  console.table(worst.map((f) => ({ page: f.page, numbers: f.numbers, precision: f.numericPrecision.toFixed(3), coverage: f.coverage.toFixed(3), unmatched: f.unmatchedNumbers.slice(0, 5).join(" ") })));
}

await saveParsed(parsed);
console.log(`\nWrote ${DOCUMENT.cacheDir}/parsed.json. Next: pnpm tree`);
