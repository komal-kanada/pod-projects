import { parseNumber } from "../normalize/units";
import type { ChartPoint, Element } from "../types";

/**
 * Chart clean-up (04 §4). The rule that matters most: a value is "labelled"
 * only if it is printed on the chart. Anything marked "~" is estimated, and
 * estimated values are never stated as report facts. Shares in pie, donut
 * and stacked-bar charts should sum to ~100%; if not, the chart is flagged.
 */
export type ChartElement = Extract<Element, { type: "chart" }>;

export function normalisePoint(point: Partial<ChartPoint> & { label: string; valueText: string }): ChartPoint {
  const valueText = point.valueText.trim();
  const estimated = point.valueSource === "estimated" || valueText.startsWith("~");
  const value = /^[<>≤≥]/.test(valueText) ? null : (point.value ?? parseNumber(valueText));
  return {
    label: point.label.trim(),
    valueText: estimated && !valueText.startsWith("~") ? `~${valueText}` : valueText,
    value: value === undefined ? null : value,
    valueSource: estimated ? "estimated" : "labelled",
  };
}

export function shareSumFlags(chart: ChartElement): string[] {
  if (!["pie", "donut", "stacked_bar"].includes(chart.chartType)) return [];
  const flags: string[] = [];
  for (const series of chart.series) {
    const labelled = series.points.filter((p) => p.valueSource === "labelled" && /%/.test(p.valueText));
    if (labelled.length < 2 || labelled.length !== series.points.length) continue;
    const sum = labelled.reduce((total, p) => total + (p.value ?? 0), 0);
    const hasLessThan = series.points.some((p) => /^</.test(p.valueText));
    if (Math.abs(sum - 100) > (hasLessThan ? 3 : 2)) flags.push(`"${series.name}" shares sum to ${sum.toFixed(1)}%`);
  }
  return flags;
}

export function normaliseChart(chart: ChartElement): ChartElement {
  const normalised = { ...chart, series: chart.series.map((s) => ({ name: s.name.trim(), points: s.points.map(normalisePoint) })) };
  const flags = shareSumFlags(normalised);
  if (flags.length) {
    normalised.fidelity = {
      checked: normalised.fidelity?.checked ?? false,
      numericPrecision: normalised.fidelity?.numericPrecision ?? null,
      flags: [...(normalised.fidelity?.flags ?? []), ...flags],
    };
  }
  return normalised;
}

/** A chart as a compact table of its data — what the answer model reads. */
export function chartAsMarkdown(chart: ChartElement): string {
  const labels = [...new Set(chart.series.flatMap((s) => s.points.map((p) => p.label)))];
  const header = `| ${chart.xLabel ?? "Category"} | ${chart.series.map((s) => s.name).join(" | ")} |`;
  const divider = `| --- | ${chart.series.map(() => "---").join(" | ")} |`;
  const rows = labels.map((label) => {
    const cells = chart.series.map((s) => {
      const point = s.points.find((p) => p.label === label);
      if (!point) return "";
      return `${point.valueText}${point.valueSource === "labelled" ? " (labelled)" : " (estimated, not printed)"}`;
    });
    return `| ${label} | ${cells.join(" | ")} |`;
  });
  return [`Chart (${chart.chartType.replace("_", " ")})${chart.unit ? `, unit: ${chart.unit}` : ""}`, header, divider, ...rows, `Description: ${chart.description}`].join("\n");
}
