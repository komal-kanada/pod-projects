import { Tag } from "@pod/ui/rag/states";
import { REGIONS, COUNTRIES } from "@/lib/metadata/vocab";
import type { QueryAnalysis } from "@/lib/types";

/** "Understood as: comparison · South Asia, Sub-Saharan Africa · 2025 · tables" (B4+). */
export function AnalysisChips({ analysis }: { analysis: QueryAnalysis }) {
  const f = analysis.filters;
  const chips = [
    ...(f.regions ?? []).map((code) => REGIONS[code]?.name ?? code),
    ...(f.countries ?? []).map((code) => COUNTRIES[code]?.name ?? code),
    ...(f.years ?? []).map(String),
    ...(f.contentTypes ?? []).map((t) => `${t}s`),
    ...(f.chapter ? [f.chapter] : []),
    ...(analysis.wantsForecast ? ["forecast"] : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[0.8125rem]">
      <span className="text-muted-foreground mr-1">Understood as</span>
      <Tag tone="brand">{analysis.intent.replace("_", " ")}</Tag>
      {chips.map((chip) => (
        <Tag key={chip}>{chip}</Tag>
      ))}
      {analysis.subQueries.length ? <Tag>{analysis.subQueries.length} sub-queries</Tag> : null}
      {analysis.fallback ? <Tag tone="caution">analysis unavailable — searched as asked</Tag> : null}
      {analysis.dropped?.length ? (
        <span className="text-muted-foreground" title={analysis.dropped.join(", ")}>
          · {analysis.dropped.length} unknown filter{analysis.dropped.length > 1 ? "s" : ""} ignored
        </span>
      ) : null}
    </div>
  );
}
