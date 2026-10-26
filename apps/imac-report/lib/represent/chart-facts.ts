import type { ChartElement } from "../extract/charts";

/**
 * Chart values as searchable sentences (05 §2) — only values printed on the
 * chart. Estimated points produce no fact sentence, so an eyeballed number
 * can never be retrieved as if the report stated it.
 */
export function chartFacts(chart: ChartElement, notes: string[]): string[] {
  const title = chart.title ? `Chart "${chart.title}"` : "Chart";
  const unit = chart.unit && !/%/.test(chart.unit) ? ` ${chart.unit}` : "";
  const suffix = notes.length ? ` [Notes: ${notes.join(" ")}]` : "";

  return chart.series.flatMap((series) => {
    const labelled = series.points.filter((p) => p.valueSource === "labelled");
    if (labelled.length === 0) return [];
    const name = chart.series.length > 1 || (series.name && series.name !== "Series 1") ? `${series.name} — ` : "";
    // Many points: one sentence per series instead of one per point.
    if (labelled.length > 12) {
      return [`${title} (page ${chart.page}, ${chart.chartType.replace("_", " ")}): ${name}${labelled.map((p) => `${p.label}: ${p.valueText}${unit}`).join("; ")} (labelled on chart).${suffix}`];
    }
    return labelled.map((p) => `${title} (page ${chart.page}, ${chart.chartType.replace("_", " ")}): ${name}${p.label}: ${p.valueText}${unit} (labelled on chart).${suffix}`);
  });
}

export function chartSummary(chart: ChartElement): string {
  const estimated = chart.series.some((s) => s.points.some((p) => p.valueSource === "estimated"));
  return [
    chart.title ? `Chart: ${chart.title}` : "Chart",
    `Type: ${chart.chartType.replace("_", " ")}${chart.unit ? `, unit: ${chart.unit}` : ""}`,
    chart.series.length ? `Series: ${chart.series.map((s) => s.name).join(", ")}` : "",
    chart.description,
    estimated ? "Some values are approximate visual readings, not labelled on the chart." : "",
  ]
    .filter(Boolean)
    .join("\n");
}
