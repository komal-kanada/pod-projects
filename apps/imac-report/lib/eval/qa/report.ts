import { formatDelta, formatMetric, groupBy, markdownTable } from "@pod/eval/report";
import { passed, summarise, type QaResult } from "./score";

/** Preset × metric, the category × preset table (the key view), and the flip list. */
export function renderQaReport({ header, presets, results, judged }: { header: Record<string, string>; presets: string[]; results: QaResult[]; judged: boolean }): string {
  const byPreset = new Map(presets.map((p) => [p, results.filter((r) => r.preset === p)]));
  const sums = new Map(presets.map((p) => [p, summarise(byPreset.get(p)!)]));
  type Key = keyof ReturnType<typeof summarise>;
  const metrics: [string, Key, number?][] = [
    ["Hit@1", "hit1"], ["Hit@3", "hit3"], ["Hit@6", "hit6"], ["Recall@6", "recall6"], ["MRR", "mrr"],
    ...(judged
      ? ([["Numeric", "numericMatch"], ["Correct", "correctness"], ["Faithful", "faithfulness"], ["Fn used", "footnoteUsed"], ["Est→exact", "estimatedAsExact", 0], ["OOS refuse", "outOfScopeRefusal"], ["Images", "imagesMean", 1], ["p95 ms", "latencyP95", 0]] as [string, Key, number?][])
      : []),
  ];

  const lines = [`# QA ablation — ${header.Date}`, ""];
  for (const [k, v] of Object.entries(header)) if (k !== "Date") lines.push(`- **${k}:** ${v}`);
  lines.push(
    "",
    markdownTable(
      ["Preset", ...metrics.map(([n]) => n)],
      presets.map((p, i) => {
        const s = sums.get(p)!;
        const prev = i > 0 ? sums.get(presets[i - 1])! : null;
        return [p, ...metrics.map(([, key, digits]) => `${formatMetric(s[key] as number | null, digits ?? 2)}${prev && digits === undefined ? formatDelta(s[key] as number | null, prev[key] as number | null) : ""}`)];
      }),
    ),
  );

  lines.push("", `## Category × preset — ${judged ? "correctness" : "element Hit@6"}`, "");
  const categories = Object.keys(groupBy(results, (r) => r.category));
  lines.push(
    markdownTable(
      ["Category", ...presets],
      categories.map((c) => [c, ...presets.map((p) => {
        const s = summarise(byPreset.get(p)!.filter((r) => r.category === c));
        return formatMetric(c === "out_of_scope" ? s.outOfScopeRefusal : judged ? s.correctness : s.hit6);
      })]),
    ),
  );

  lines.push("", "## Flips between adjacent presets", "");
  for (let i = 1; i < presets.length; i += 1) {
    const before = new Map(byPreset.get(presets[i - 1])!.map((r) => [r.id, passed(r)]));
    const better = byPreset.get(presets[i])!.filter((r) => before.get(r.id) === false && passed(r) === true).map((r) => r.id);
    const worse = byPreset.get(presets[i])!.filter((r) => before.get(r.id) === true && passed(r) === false).map((r) => r.id);
    lines.push(`- **${presets[i - 1]} → ${presets[i]}:** better ${better.join(", ") || "—"} · worse ${worse.join(", ") || "—"}`);
  }

  const failures = results.filter((r) => passed(r) === false || r.error || r.estimatedAsExact);
  lines.push("", `## Failures (${failures.length})`, "", "Tag each: render · detect · extract · fidelity · footnote-link · represent · search · expand · context · prompt · judge.");
  for (const r of failures) {
    lines.push("", `### ${r.preset} · ${r.id} (${r.category})${r.estimatedAsExact ? " — stated an estimate as exact" : ""}`, `Question: ${r.question}`, `Sources: ${r.sourcesSeen.map((s) => `${s.type} p.${s.page}${s.title ? ` "${s.title}"` : ""}`).join("; ")}`);
    if (r.answer !== undefined) lines.push(`Answer: ${r.answer.replace(/\n+/g, " ")}`);
    if (r.correctnessReason) lines.push(`Judge: ${r.correctnessReason}`);
    if (r.disagreements?.length) lines.push(`Model reported image/extraction disagreement on: ${r.disagreements.join(", ")}`);
    if (r.error) lines.push(`Error: ${r.error}`);
    lines.push("Cause: ");
  }
  return `${lines.join("\n")}\n`;
}
