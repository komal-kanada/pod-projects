import { Tag } from "@pod/ui/rag/states";
import { CONFIG } from "@/lib/config";
import type { IngestionRun, RunKey } from "@/lib/types";

/** The runs presets read from: X0:flat (M0), X1:flat (M1), chosen:typed (M2+). */
export function RunsBadge({ runs }: { runs: Partial<Record<RunKey, IngestionRun>> }) {
  const keys = ["X0:flat", "X1:flat", `${CONFIG.extraction.chosen}:typed`] as RunKey[];
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Active ingestion runs">
      {keys.map((key) => (
        <li key={key}>
          <Tag tone={runs[key] ? "positive" : "neutral"} className={runs[key] ? "" : "opacity-60"}>
            <span aria-hidden className={runs[key] ? "bg-positive size-1.5 rounded-full" : "bg-muted-foreground size-1.5 rounded-full"} />
            {key}
            {runs[key] ? null : <span className="sr-only">(not ingested)</span>}
          </Tag>
        </li>
      ))}
    </ul>
  );
}
