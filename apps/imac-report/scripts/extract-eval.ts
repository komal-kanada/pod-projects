/**
 * `pnpm extract:eval --strategies X0,X1,X2` — scores cached extractions
 * against eval/ground-truth/ (without overrides) → eval/results/extraction-*.md
 */
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { timestampSlug } from "@pod/eval/report";
import { DOCUMENT } from "../lib/config";
import { loadGroundTruth } from "../lib/eval/extraction/ground-truth";
import { renderExtractionReport } from "../lib/eval/extraction/report";
import { scoreExtraction } from "../lib/eval/extraction/score";
import { extractDocument } from "../lib/extract/run";
import { loadInputs, optionalGemini, strategyList } from "./shared";

const { values } = parseArgs({ options: { strategies: { type: "string" } } });
const strategies = strategyList(values.strategies, ["X0", "X1", "X2"]);
const gt = await loadGroundTruth();
if (gt.tables.length + gt.charts.length + gt.footnotes.length + gt.coverage.length === 0) {
  console.error("eval/ground-truth/ is empty. Label tables.json, charts.json, footnotes.json and coverage.json first (docs/10 §1).");
  process.exit(1);
}

const { data, pages } = await loadInputs();
const gemini = optionalGemini();
const rows = [];
for (const strategy of strategies) {
  const result = await extractDocument(strategy, { gemini, data, pages, cacheDir: DOCUMENT.cacheDir, applyOverrides: false, log: () => {} });
  const score = scoreExtraction(result.elements, result.links, gt);
  const timed = result.perPage.filter((p) => p.ms > 0);
  rows.push({
    strategy,
    score,
    secondsPerPage: timed.length ? timed.reduce((s, p) => s + p.ms, 0) / timed.length / 1000 : null,
    tokensPerPage: timed.length ? timed.reduce((s, p) => s + p.tokens, 0) / timed.length : null,
  });
  console.log(`${strategy}: cells ${score.cellAccuracy?.toFixed(2) ?? "–"} · chart values ${score.chartValueAccuracy?.toFixed(2) ?? "–"} · false-labelled ${score.chartFalseLabelled} · fn links ${score.footnoteLinkAccuracy?.toFixed(2) ?? "–"} · coverage ${score.factCoverage?.toFixed(2) ?? "–"}`);
}

const header = {
  Date: new Date().toISOString().slice(0, 16).replace("T", " "),
  "Ground truth": `${gt.tables.length} tables, ${gt.charts.length} charts, ${gt.footnotes.length} footnotes, ${gt.coverage.length} pages of facts`,
};
const base = `eval/results/extraction-${timestampSlug()}`;
await mkdir("eval/results", { recursive: true });
await writeFile(`${base}.md`, renderExtractionReport(header, rows));
await writeFile(`${base}.json`, JSON.stringify({ header, rows }, null, 2));
console.log(`\nWrote ${base}.md — summarise the winner in docs/EXTRACTION-RESULTS.md and set CONFIG.extraction.chosen.`);
