import { formatMetric, groupBy, markdownTable } from "@pod/eval/report";
import type { QuestionResult, Summary } from "./score";
import { summarise } from "./score";

/** Writes the markdown half of an eval result (the JSON half is the raw records). */
export function renderReport({
  header,
  results,
  judged,
}: {
  header: Record<string, string>;
  results: QuestionResult[];
  judged: boolean;
}): string {
  const all = summarise(results);
  const provided = summarise(results.filter((r) => r.source === "provided"));
  const added = summarise(results.filter((r) => r.source === "added"));

  const rows: [string, (s: Summary) => string][] = [
    ["Questions (scored)", (s) => `${s.questions} (${s.scored})`],
    ["Hit@1", (s) => formatMetric(s.hit1)],
    ["Hit@3", (s) => formatMetric(s.hit3)],
    ["Hit@6", (s) => formatMetric(s.hit6)],
    ["Recall@6", (s) => formatMetric(s.recall6)],
    ["MRR", (s) => formatMetric(s.mrr)],
  ];
  if (judged) {
    rows.push(
      ["Correctness", (s) => formatMetric(s.correctness)],
      ["Faithfulness", (s) => formatMetric(s.faithfulness)],
      ["Citation accuracy", (s) => formatMetric(s.citationAccuracy)],
      ["Invalid citations", (s) => String(s.invalidCitations)],
      ["Out-of-scope refusal", (s) => formatMetric(s.outOfScopeRefusal)],
      ["In-scope wrong refusals", (s) => String(s.wrongRefusals)],
      ["Latency p50 / p95 (ms)", (s) => `${formatMetric(s.latencyP50, 0)} / ${formatMetric(s.latencyP95, 0)}`],
      ["First token p50 (ms)", (s) => formatMetric(s.firstTokenP50, 0)],
    );
  }

  const lines: string[] = [`# Eval — ${header.Date}`, ""];
  for (const [key, value] of Object.entries(header)) {
    if (key !== "Date") lines.push(`- **${key}:** ${value}`);
  }
  lines.push("", "## Summary", "", markdownTable(["Metric", "All", "provided", "added"], rows.map(([name, f]) => [name, f(all), f(provided), f(added)])));

  const byCategory = groupBy(results, (r) => r.category);
  lines.push(
    "",
    "## Per category",
    "",
    markdownTable(
      ["Category", "n", "Hit@6", "MRR", ...(judged ? ["Correct", "Refused"] : [])],
      Object.entries(byCategory).map(([category, items]) => {
        const s = summarise(items);
        const refused = items.filter((r) => r.refused).length;
        return [category, items.length, formatMetric(s.hit6), formatMetric(s.mrr), ...(judged ? [formatMetric(s.correctness), String(refused)] : [])];
      }),
    ),
  );

  const unlabelled = results.filter((r) => !r.labelled);
  if (unlabelled.length) {
    lines.push("", `## Not yet labelled (${unlabelled.length})`, "", "These have no expected pages/answer yet, so they are answered but not scored:", "");
    for (const r of unlabelled) lines.push(`- ${r.id}: ${r.question}`);
  }

  const failures = results.filter((r) => {
    if (r.error) return true;
    if (r.category === "out_of_scope") return r.refused === false;
    return r.labelled && (r.hit6 === 0 || (judged && (r.correctness ?? 2) < 2) || r.faithful === false || r.refused === true);
  });

  lines.push("", `## Failures (${failures.length})`, "", "Write a one-line cause next to each: parse / chunk / retrieval / prompt / judge.");
  for (const r of failures) {
    lines.push(
      "",
      `### ${r.id} (${r.category}) — Hit@6 ${r.hit6 === null ? "–" : r.hit6 ? "✓" : "✗"}${judged ? `, correctness ${r.correctness ?? "–"}` : ""}`,
      `Question: ${r.question}`,
      `Expected pages: ${r.expectedPages.join(", ") || "–"} · Retrieved pages: ${r.retrievedPages.map(([a, b]) => (a === b ? a : `${a}–${b}`)).join(", ")}`,
    );
    if (r.answer !== undefined) lines.push(`Answer: ${r.answer.replace(/\n+/g, " ")}`);
    if (r.correctnessReason) lines.push(`Judge: ${r.correctnessReason}`);
    if (r.unsupportedClaims?.length) lines.push(`Unsupported claims: ${r.unsupportedClaims.join(" | ")}`);
    if (r.error) lines.push(`Error: ${r.error}`);
    lines.push("Cause: ");
  }

  if (judged) {
    lines.push("", "## Manual review", "", "Review every failure above and 10 random passes; mark whether you agree with the judge.", "", "| Question | Judge agrees? | Note |", "| --- | --- | --- |");
  }
  return `${lines.join("\n")}\n`;
}
