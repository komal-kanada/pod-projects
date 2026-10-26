import { Tag } from "@pod/ui/rag/states";
import type { IngestionRun } from "@/lib/types";

/** Which ingestion run is answering — short id, chunk count, chunk config. */
export function RunBadge({ run }: { run: IngestionRun }) {
  const chunk = (run.config as { chunk?: { targetChars?: number; overlapChars?: number } }).chunk;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
      <Tag tone="positive">
        <span aria-hidden className="bg-positive size-1.5 rounded-full" />
        Run {run.id.slice(0, 8)}
      </Tag>
      <Tag>{run.chunkCount ?? 0} chunks</Tag>
      {chunk?.targetChars ? (
        <Tag>
          {chunk.targetChars}/{chunk.overlapChars} chars
        </Tag>
      ) : null}
    </div>
  );
}
