import type { BBox, Element } from "../types";
import { normaliseChart } from "./charts";
import type { RawElement } from "./schema";
import { normaliseTable } from "./tables";

/** Model JSON → a typed Element (or null if it's unusable). */
export function fromRaw(raw: RawElement, base: { key: string; page: number; order: number }): Element | null {
  const box = raw.box_2d?.length === 4 ? (raw.box_2d.map((v) => Math.max(0, Math.min(1000, Math.round(v)))) as BBox) : null;
  const common = { ...base, bbox: box, footnoteRefs: (raw.footnoteRefs ?? []).map(String) };
  const title = raw.title ?? undefined;

  switch (raw.type) {
    case "heading":
      return raw.text ? { ...common, type: "heading", level: raw.level ?? 2, text: raw.text } : null;
    case "text":
      return raw.text ? { ...common, type: "text", text: raw.text } : null;
    case "footnote":
      return raw.text ? { ...common, type: "footnote", marker: (raw.marker ?? "").replace(/^\^/, "").trim() || "*", text: raw.text } : null;
    case "callout":
      return raw.text || raw.figure ? { ...common, type: "callout", text: raw.text ?? "", figure: raw.figure ?? undefined, iconMeaning: raw.iconMeaning ?? undefined } : null;
    case "image":
      return { ...common, type: "image", description: raw.description ?? raw.text ?? "" };
    case "table":
      if (!raw.rows?.length) return null;
      return normaliseTable({
        ...common,
        type: "table",
        title,
        columns: raw.columns ?? [],
        rows: raw.rows,
        rowHeaderCols: raw.rowHeaderCols ?? 1,
        unit: raw.unit ?? undefined,
        notes: raw.notes ?? undefined,
      });
    case "chart":
      return normaliseChart({
        ...common,
        type: "chart",
        chartType: (["bar", "stacked_bar", "pie", "donut", "line"].includes(raw.chartType ?? "") ? raw.chartType : "other") as "other",
        title,
        unit: raw.unit ?? undefined,
        xLabel: raw.xLabel ?? undefined,
        yLabel: raw.yLabel ?? undefined,
        series: (raw.series ?? []).map((s) => ({ name: s.name, points: s.points.map((p) => ({ ...p, value: p.value ?? null })) })),
        description: raw.description ?? "",
      });
  }
}
