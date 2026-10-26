import { Tag } from "@pod/ui/rag/states";
import type { QueryAnalysis } from "@/lib/types";

/** "Looking in: chart · footnote · variant: two ports" (M3+). */
export function AnalysisChips({ analysis }: { analysis: QueryAnalysis }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[0.8125rem]">
      <span className="text-muted-foreground mr-1">Looking in</span>
      <Tag tone="brand">{analysis.intent.replace("_", " ")}</Tag>
      {analysis.targetTypes.map((t) => (
        <Tag key={t}>{t}</Tag>
      ))}
      {analysis.variants.map((v) => (
        <Tag key={v}>variant: {v}</Tag>
      ))}
      {analysis.phases.map((p) => (
        <Tag key={p}>{p.replace("_", " ")}</Tag>
      ))}
      {analysis.fallback ? <Tag tone="caution">analysis unavailable — searched as asked</Tag> : null}
      {analysis.dropped?.length ? <span className="text-muted-foreground" title={analysis.dropped.join(", ")}>· {analysis.dropped.length} unknown name(s) ignored</span> : null}
    </div>
  );
}
