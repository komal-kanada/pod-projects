import { Tag } from "@pod/ui/rag/states";
import { RUN_KINDS, type RunKind } from "@/lib/config";
import type { IngestionRun } from "@/lib/types";

/** Which run answers for each kind; a missing kind disables the presets that need it. */
export function RunsBadge({ runs }: { runs: Partial<Record<RunKind, IngestionRun>> }) {
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Active ingestion runs">
      {RUN_KINDS.map((kind) => (
        <li key={kind}>
          <Tag tone={runs[kind] ? "positive" : "neutral"} className={runs[kind] ? "" : "opacity-60"}>
            <span aria-hidden className={runs[kind] ? "bg-positive size-1.5 rounded-full" : "bg-muted-foreground size-1.5 rounded-full"} />
            {kind}
            {runs[kind] ? <span className="font-normal opacity-75">{runs[kind]!.id.slice(0, 6)}</span> : <span className="sr-only">(not ingested)</span>}
          </Tag>
        </li>
      ))}
    </ul>
  );
}
