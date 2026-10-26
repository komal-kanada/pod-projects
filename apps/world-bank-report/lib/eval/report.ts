import { formatDelta, formatMetric, groupBy, markdownTable } from "@pod/eval/report";
import { passed, summarise, type QuestionResult, type Summary } from "./score";

/**
 * The ablation report (10 §3): preset × metric with deltas vs the previous
 * preset, per-category correctness, the flip list, and failures of the best
 * preset — the flip list being the most useful part.
 */
export function renderAblation({
  header,
  presets,
  results,
  judged,
}: {
  header: Record<string, string>;
  presets: string[];
  results: QuestionResult[];
  judged: boolean;
}): string {
  const byPreset = new Map(presets.map((p) => [p, results.filter((r) => r.preset === p)]));
  const summaries = new Map(presets.map((p) => [p, summarise(byPreset.get(p)!)]));

  const metrics: [string, keyof Summary, number?][] = [
    ["Hit@5", "hit5"], ["MRR", "mrr"], ["nDCG@10", "ndcg10"], ["SecAcc@5", "sectionAcc5"],
    ["CtxHit", "contextHit"], ["CtxPrec", "contextPrecision"],
    ...(judged ? ([["Correct", "correctness"], ["Faithful", "faithfulness"], ["CiteAcc", "citationAccuracy"], ["OOS refuse", "outOfScopeRefusal"]] as [string, keyof Summary][]) : []),
    ["Ctx tok", "contextTokensMean", 0],
    ...(judged ? ([["p95 ms", "latencyP95", 0]] as [string, keyof Summary, number][]) : []),
  ];

  const lines = [`# Ablation — ${header.Date}`, ""];
  for (const [key, value] of Object.entries(header)) if (key !== "Date") lines.push(`- **${key}:** ${value}`);

  lines.push("", "## Presets", "");
  lines.push(
    markdownTable(
      ["Preset", ...metrics.map(([name]) => name)],
      presets.map((preset, i) => {
        const s = summaries.get(preset)!;
        const prev = i > 0 ? summaries.get(presets[i - 1])! : null;
        return [
          preset,
          ...metrics.map(([, key, digits]) => {
            const value = s[key] as number | null;
            const delta = prev && digits === undefined ? formatDelta(value, prev[key] as number | null) : "";
            return `${formatMetric(value, digits ?? 2)}${delta}`;
          }),
        ];
      }),
    ),
  );

  for (const source of ["provided", "added"] as const) {
    lines.push("", `### ${source} questions only`, "");
    lines.push(
      markdownTable(
        ["Preset", "n", "Hit@5", "MRR", ...(judged ? ["Correct"] : [])],
        presets.map((p) => {
          const s = summarise(byPreset.get(p)!.filter((r) => r.source === source));
          return [p, s.n, formatMetric(s.hit5), formatMetric(s.mrr), ...(judged ? [formatMetric(s.correctness)] : [])];
        }),
      ),
    );
  }

  const categories = Object.keys(groupBy(results, (r) => r.category));
  lines.push("", `## Per category — ${judged ? "correctness" : "Hit@5"}`, "");
  lines.push(
    markdownTable(
      ["Category", ...presets],
      categories.map((category) => [
        category,
        ...presets.map((p) => {
          const s = summarise(byPreset.get(p)!.filter((r) => r.category === category));
          return formatMetric(category === "out_of_scope" ? s.outOfScopeRefusal : judged ? s.correctness : s.hit5);
        }),
      ]),
    ),
  );

  lines.push("", "## Flips between adjacent presets", "");
  for (let i = 1; i < presets.length; i += 1) {
    const before = new Map(byPreset.get(presets[i - 1])!.map((r) => [r.id, passed(r)]));
    const better: string[] = [];
    const worse: string[] = [];
    for (const r of byPreset.get(presets[i])!) {
      const was = before.get(r.id);
      const now = passed(r);
      if (was === false && now === true) better.push(r.id);
      if (was === true && now === false) worse.push(r.id);
    }
    lines.push(`- **${presets[i - 1]} → ${presets[i]}:** better ${better.join(", ") || "—"} · worse ${worse.join(", ") || "—"}`);
  }

  const best = presets.reduce((a, b) => {
    const score = (p: string) => (judged ? summaries.get(p)!.correctness : summaries.get(p)!.hit5) ?? -1;
    return score(b) > score(a) ? b : a;
  });
  const failures = byPreset.get(best)!.filter((r) => passed(r) === false || r.error);
  lines.push("", `## Failures of the best preset (${best}) — ${failures.length}`, "", "Tag each cause: parse · tree · chunk · metadata · analysis · search · rerank · context · prompt · judge.");
  for (const r of failures) {
    lines.push(
      "",
      `### ${r.id} (${r.category})`,
      `Question: ${r.question}`,
      `Retrieved pages: ${r.retrievedPages.slice(0, 10).map(([a, b]) => (a === b ? a : `${a}–${b}`)).join(", ")}`,
    );
    if (r.answer !== undefined) lines.push(`Answer: ${r.answer.replace(/\n+/g, " ")}`);
    if (r.correctnessReason) lines.push(`Judge: ${r.correctnessReason}`);
    if (r.error) lines.push(`Error: ${r.error}`);
    lines.push("Cause: ");
  }

  const unlabelled = results.filter((r) => !r.labelled && r.preset === presets[0]);
  if (unlabelled.length) {
    lines.push("", `## Not yet labelled (${unlabelled.length})`, "");
    for (const r of unlabelled) lines.push(`- ${r.id}: ${r.question}`);
  }
  return `${lines.join("\n")}\n`;
}
