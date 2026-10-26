"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@pod/ui/cn";
import { AnswerMarkdown } from "@pod/ui/rag/answer-markdown";
import { SkeletonLines, Tag } from "@pod/ui/rag/states";
import type { ContextSource } from "@/lib/types";
import { PATH_SEPARATOR } from "@/lib/types";

/**
 * The assembled context, grouped by section — what the model actually read.
 * Tables render as tables. Cited sources are marked, uncited ones quieter.
 */
export function SourcesBySection({
  sources,
  cited,
  highlight,
  onClearHighlight,
}: {
  sources: ContextSource[] | null;
  cited: number[] | null;
  highlight: number | null;
  onClearHighlight: () => void;
}) {
  if (sources === null) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="surface p-4">
            <SkeletonLines lines={2} />
          </div>
        ))}
      </div>
    );
  }
  if (sources.length === 0) {
    return <p className="text-muted-foreground bg-surface-2 rounded-panel p-4 text-sm">No passages were retrieved.</p>;
  }

  const groups: { key: string; items: ContextSource[] }[] = [];
  for (const source of sources) {
    const key = source.sectionPath.slice(0, 2).join(PATH_SEPARATOR) || "Report";
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(source);
    else groups.push({ key, items: [source] });
  }

  return (
    <div className="space-y-5">
      {groups.map((group, i) => (
        <section key={`${group.key}-${i}`} aria-label={group.key}>
          <h3 className="text-muted-foreground mb-2 truncate px-1 text-[0.75rem] font-medium">{group.key}</h3>
          <ol className="space-y-2">
            {group.items.map((source) => (
              <SourceCard
                key={source.n}
                source={source}
                cited={cited === null ? null : cited.includes(source.n)}
                highlighted={highlight === source.n}
                onCollapse={onClearHighlight}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function SourceCard({
  source,
  cited,
  highlighted,
  onCollapse,
}: {
  source: ContextSource;
  cited: boolean | null;
  highlighted: boolean;
  onCollapse: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const open = opened || highlighted;
  const name = source.title ?? source.sectionPath.at(-1) ?? "Report";

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
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setOpened(false);
            onCollapse();
          } else setOpened(true);
        }}
        className="hover:bg-surface-2/60 flex w-full items-start gap-3 p-3.5 text-left transition-colors"
      >
        <span className="bg-surface-2 flex size-6 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-medium tabular-nums">
          {source.n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.875rem] font-medium">{name}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Tag tone="brand">{source.pageLabel}</Tag>
            <Tag>{source.contentType}</Tag>
            <span className="text-muted-foreground text-[0.75rem] tabular-nums">{source.tokens.toLocaleString()} tok</span>
            {cited ? <Tag tone="positive">cited</Tag> : null}
          </span>
        </span>
        <ChevronDown className={cn("text-muted-foreground mt-1 size-4 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="border-hairline max-h-[28rem] overflow-y-auto border-t px-4 pt-3 pb-4">
          {source.contentType === "table" ? (
            <div className="excerpt">
              <AnswerMarkdown text={source.text} renderCitation={(n) => `[${n}]`} />
            </div>
          ) : (
            <p className="excerpt">{source.text}</p>
          )}
        </div>
      ) : null}
    </li>
  );
}
