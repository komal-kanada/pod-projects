"use client";

import { ChevronRight } from "lucide-react";

export interface TraceStageView {
  stage: string;
  ms: number;
  /** One line a person can read: "30 → 8 kept". */
  summary?: string;
  details?: unknown;
}

/**
 * What the pipeline did for this question, stage by stage, with timings.
 * Collapsed by default; every stage expands to its raw details.
 */
export function TracePanel({ stages, open }: { stages: TraceStageView[]; open?: boolean }) {
  if (stages.length === 0) return null;
  const total = stages.reduce((sum, stage) => sum + stage.ms, 0);

  return (
    <details className="group/trace surface mt-6 p-0" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="text-muted-foreground size-4 transition-transform duration-200 group-open/trace:rotate-90"
          aria-hidden
        />
        Retrieval trace
        <span className="text-muted-foreground ml-auto font-normal tabular-nums">
          {stages.length} stages · {formatMs(total)}
        </span>
      </summary>
      <ol className="border-hairline divide-hairline divide-y border-t">
        {stages.map((stage, index) => (
          <li key={`${stage.stage}-${index}`}>
            <details className="group/stage">
              <summary className="hover:bg-surface-2 flex cursor-pointer list-none items-baseline gap-3 px-5 py-2.5 text-[0.8125rem] [&::-webkit-details-marker]:hidden">
                <span className="text-muted-foreground w-5 tabular-nums">{index + 1}</span>
                <span className="w-20 shrink-0 font-medium">{stage.stage}</span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate">{stage.summary}</span>
                <span className="text-muted-foreground tabular-nums">{formatMs(stage.ms)}</span>
              </summary>
              {stage.details !== undefined ? (
                <pre className="bg-surface-2 text-muted-foreground mx-5 mb-3 max-h-80 overflow-auto rounded-tight p-3 font-mono text-[0.75rem] leading-relaxed">
                  {JSON.stringify(stage.details, null, 2)}
                </pre>
              ) : null}
            </details>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}
