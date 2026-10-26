"use client";

import { ChevronDown, ImageIcon, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { cn } from "@pod/ui/cn";
import { Tag } from "@pod/ui/rag/states";
import type { ChartSeries, ElementSource } from "@/lib/types";
import { TypeIcon, typeLabel } from "../type-icon";
import { SourceChart } from "./source-chart";

/**
 * One source, drawn the way its type deserves (11 §1): tables as tables with
 * the matched rows highlighted, charts redrawn next to the original crop,
 * footnotes with what references them.
 */
export function SourceCard({
  source,
  cited,
  highlighted,
  disagreement,
  onCollapse,
}: {
  source: ElementSource;
  cited: boolean | null;
  highlighted: boolean;
  disagreement: boolean;
  onCollapse: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const [showCrop, setShowCrop] = useState(false);
  const open = opened || highlighted;
  const title = source.title ?? (source.type === "flat" ? `Page ${source.page}` : source.section ?? typeLabel(source.type));

  return (
    <li
      id={`source-${source.n}`}
      className={cn("surface scroll-mt-24 overflow-hidden transition-[opacity,box-shadow] duration-200", cited === false && !highlighted && "opacity-65", highlighted && "ring-brand/50 ring-2")}
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
        <span className="bg-surface-2 flex size-6 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-medium tabular-nums">{source.n}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[0.875rem] font-medium">
            <TypeIcon type={source.type} />
            <span className="truncate">{title}</span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Tag>{typeLabel(source.type)}</Tag>
            <Tag tone="brand">p. {source.page}</Tag>
            {source.imageAttached ? (
              <Tag>
                <ImageIcon className="size-3" aria-hidden />
                image sent
              </Tag>
            ) : null}
            {source.footnotes.length ? <Tag>{source.footnotes.length} note{source.footnotes.length > 1 ? "s" : ""}</Tag> : null}
            {cited ? <Tag tone="positive">cited</Tag> : null}
            {disagreement ? (
              <Tag tone="caution">
                <TriangleAlert className="size-3" aria-hidden />
                image ≠ extracted data
              </Tag>
            ) : null}
          </span>
        </span>
        <ChevronDown className={cn("text-muted-foreground mt-1 size-4 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <div className="border-hairline space-y-3 border-t px-4 pt-3 pb-4">
          {source.type === "table" && source.data ? (
            <SourceTable data={source.data} hitRows={source.hitRows} />
          ) : source.type === "chart" && source.data ? (
            <SourceChart series={(source.data.series as ChartSeries[]) ?? []} unit={source.data.unit as string | null} />
          ) : source.type === "footnote" ? (
            <div className="text-[0.875rem] leading-relaxed">
              <p>{source.text.replace(/^\[[^\]]+\]\s*/, "")}</p>
              {source.referencedBy ? <p className="text-muted-foreground mt-2 text-[0.8125rem]">↳ referenced by {source.referencedBy}</p> : null}
            </div>
          ) : (
            <p className="excerpt max-h-80 overflow-y-auto">{source.text}</p>
          )}

          {source.footnotes.length && source.type !== "footnote" ? (
            <ul className="bg-surface-2 space-y-1 rounded-tight p-3 text-[0.8125rem]">
              {source.footnotes.map((f) => (
                <li key={f.id}>
                  <span className="font-medium">[{f.marker}]</span> {f.text}
                </li>
              ))}
            </ul>
          ) : null}

          {source.cropPath ? (
            <div>
              <button type="button" onClick={() => setShowCrop((v) => !v)} className="text-muted-foreground hover:text-foreground text-[0.8125rem] underline-offset-4 hover:underline">
                {showCrop ? "Hide the original" : "Show the original from the PDF"}
              </button>
              {showCrop ? (
                // eslint-disable-next-line @next/next/no-img-element -- static crop, exact pixels wanted
                <img src={source.cropPath} alt={`Original ${typeLabel(source.type).toLowerCase()} from page ${source.page}`} className="border-hairline mt-2 w-full rounded-tight border bg-white" loading="lazy" />
              ) : null}
            </div>
          ) : null}
          <a href={`/explorer?page=${source.page}`} className="text-muted-foreground hover:text-foreground inline-block text-[0.8125rem] underline-offset-4 hover:underline">
            View on page {source.page} →
          </a>
        </div>
      ) : null}
    </li>
  );
}

function SourceTable({ data, hitRows }: { data: Record<string, unknown>; hitRows: number[] }) {
  const columns = (data.columns as string[]) ?? [];
  const rows = (data.rows as string[][]) ?? [];
  return (
    <div className="border-hairline max-h-80 overflow-auto rounded-tight border">
      <table className="w-full text-left text-[0.8125rem]">
        <thead className="bg-surface-2 sticky top-0">
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col" className="px-2.5 py-2 font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={cn("border-hairline border-t", hitRows.includes(i) && "bg-brand-soft")}>
              {row.map((cell, j) => (
                <td key={j} className={cn("px-2.5 py-1.5 align-top", j > 0 && "tabular-nums")}>
                  {cell}
                  {j === 0 && hitRows.includes(i) ? <span className="sr-only"> (matched)</span> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.unit ? <p className="text-muted-foreground px-2.5 py-1.5 text-[0.75rem]">Unit: {String(data.unit)}</p> : null}
    </div>
  );
}
