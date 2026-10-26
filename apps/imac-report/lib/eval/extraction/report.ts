import { formatMetric, markdownTable } from "@pod/eval/report";
import type { ExtractionScore } from "./score";

export function renderExtractionReport(
  header: Record<string, string>,
  rows: { strategy: string; score: ExtractionScore; secondsPerPage: number | null; tokensPerPage: number | null }[],
): string {
  const lines = [`# Extraction eval — ${header.Date}`, ""];
  for (const [k, v] of Object.entries(header)) if (k !== "Date") lines.push(`- **${k}:** ${v}`);
  lines.push(
    "",
    markdownTable(
      ["Strategy", "Tbl det", "Cell acc", "Tbl shape", "Chart det", "Chart val", "False-lbl", "Fn text", "Fn link", "Coverage", "s/page", "tok/page"],
      rows.map(({ strategy, score: s, secondsPerPage, tokensPerPage }) => [
        strategy,
        formatMetric(s.tableDetection), formatMetric(s.cellAccuracy), formatMetric(s.tableStructure),
        formatMetric(s.chartDetection), formatMetric(s.chartValueAccuracy), String(s.chartFalseLabelled),
        formatMetric(s.footnoteTextAccuracy), formatMetric(s.footnoteLinkAccuracy), formatMetric(s.factCoverage),
        formatMetric(secondsPerPage, 1), formatMetric(tokensPerPage, 0),
      ]),
    ),
    "",
    "False-lbl = values marked as printed that aren't on the chart (target 0). Cost columns use cached timings from the first run.",
  );
  for (const { strategy, score } of rows) {
    lines.push("", `## ${strategy} — ${score.diffs.length} differences`, "");
    if (score.diffs.length === 0) continue;
    lines.push(markdownTable(["Kind", "Page", "Where", "Ground truth", "Extracted"], score.diffs.slice(0, 200).map((d) => [d.kind, d.page, d.what, d.expected, d.got])));
    if (score.diffs.length > 200) lines.push(`… ${score.diffs.length - 200} more in the JSON file.`);
  }
  return `${lines.join("\n")}\n`;
}
