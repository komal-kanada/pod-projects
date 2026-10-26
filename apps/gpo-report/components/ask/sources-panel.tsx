"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@pod/ui/cn";
import { ScoreBar, SkeletonLines, Tag } from "@pod/ui/rag/states";
import type { AnswerSource } from "@/lib/types";

/**
 * Every retrieved passage, in rank order. Cited ones are marked; uncited ones
 * stay visible but quieter — useful when judging why an answer went wrong.
 */
export function SourcesPanel({
  sources,
  cited,
  highlight,
  onHighlight,
}: {
  sources: AnswerSource[] | null;
  cited: number[] | null;
  highlight: number | null;
  onHighlight: (n: number | null) => void;
}) {
  return (
    <section aria-label="Sources" className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <p className="eyebrow">Sources{sources ? ` (${sources.length})` : ""}</p>
        {cited && sources ? (
          <span className="text-muted-foreground text-[0.75rem]">{cited.length} cited</span>
        ) : null}
      </div>

      {sources === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="surface p-4">
              <SkeletonLines lines={2} />
            </div>
          ))}
        </div>
      ) : sources.length === 0 ? (
        <p className="text-muted-foreground bg-surface-2 rounded-panel p-4 text-sm">No passages matched.</p>
      ) : (
        <ol className="space-y-2.5">
          {sources.map((source) => (
            <SourceCard
              key={source.chunkId}
              source={source}
              cited={cited === null ? null : cited.includes(source.n)}
              highlighted={highlight === source.n}
              onCollapse={() => highlight === source.n && onHighlight(null)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function SourceCard({
  source,
  cited,
  highlighted,
  onCollapse,
}: {
  source: AnswerSource;
  cited: boolean | null;
  highlighted: boolean;
  onCollapse: () => void;
}) {
  const [opened, setOpened] = useState(false);
  // A citation click opens the passage it points to.
  const open = opened || highlighted;

  return (
    <li
      id={`source-${source.n}`}
      className={cn(
        "surface scroll-mt-24 overflow-hidden transition-[opacity,box-shadow] duration-200",
        cited === false && !highlighted && "opacity-65",
        highlighted && "ring-brand/50 ring-2",
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (open) {
            setOpened(false);
            onCollapse();
          } else {
            setOpened(true);
          }
        }}
        aria-expanded={open}
        className="hover:bg-surface-2/60 flex w-full items-start gap-3 p-4 text-left transition-colors"
      >
        <span className="bg-surface-2 flex size-6 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-medium tabular-nums">
          {source.n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <Tag tone="brand">{source.pageLabel}</Tag>
            {cited ? <Tag tone="positive">cited</Tag> : null}
          </span>
          <span className="text-muted-foreground mt-1.5 block truncate text-[0.8125rem]">
            {source.section || "No section heading"}
          </span>
          {!open ? (
            <span className="mt-1.5 line-clamp-2 block text-[0.8125rem] leading-relaxed">{source.content}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-2">
          <ScoreBar value={source.similarity} label="Cosine similarity" />
          <ChevronDown
            className={cn("text-muted-foreground size-4 transition-transform duration-200", open && "rotate-180")}
            aria-hidden
          />
        </span>
      </button>
      {open ? (
        <div className="border-hairline border-t px-4 pt-3 pb-4">
          <p className="excerpt max-h-96 overflow-y-auto">{source.content}</p>
        </div>
      ) : null}
    </li>
  );
}
