"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@pod/ui/cn";
import { Button } from "@pod/ui/rag/button";
import { SelectField } from "@pod/ui/rag/select";
import { ErrorNote, InfoNote, SkeletonLines } from "@pod/ui/rag/states";
import type { StrategyId } from "@/lib/config";
import type { GroundTruth } from "@/lib/eval/extraction/ground-truth";
import type { StoredElement } from "@/lib/types";
import { TYPE_COLOURS, TypeIcon, typeLabel } from "../type-icon";
import { ElementPanel } from "./element-panel";

interface PageData {
  page: number;
  imagePath: string;
  width: number;
  height: number;
  elements: StoredElement[];
}

function usePages(strategy: StrategyId | "none") {
  const [state, setState] = useState<{ strategy: string; pages: PageData[] | null; error: string | null } | null>(null);
  useEffect(() => {
    if (strategy === "none") return;
    let cancelled = false;
    fetch(`/api/pages?strategy=${strategy}`)
      .then(async (r) => {
        const payload = await r.json();
        if (!r.ok) throw new Error(payload.error ?? "Couldn't load pages.");
        if (!cancelled) setState({ strategy, pages: payload.pages, error: null });
      })
      .catch((e: unknown) => !cancelled && setState({ strategy, pages: null, error: e instanceof Error ? e.message : "Couldn't load pages." }));
    return () => {
      cancelled = true;
    };
  }, [strategy]);
  return strategy === "none" ? { pages: null, error: null, loading: false } : state?.strategy === strategy ? { ...state, loading: false } : { pages: null, error: null, loading: true };
}

export function ExplorerScreen({
  strategies,
  initialStrategy,
  initialPage,
  groundTruth,
}: {
  strategies: StrategyId[];
  initialStrategy: StrategyId;
  initialPage: number;
  groundTruth: GroundTruth;
}) {
  const [strategy, setStrategy] = useState<StrategyId>(initialStrategy);
  const [compare, setCompare] = useState<StrategyId | "none">("none");
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const primary = usePages(strategy);
  const other = usePages(compare);

  const pageCount = primary.pages?.length ?? 1;
  const page = primary.pages?.find((p) => p.page === pageNumber) ?? primary.pages?.[0];
  const comparePage = other.pages?.find((p) => p.page === page?.page);
  const selected = page?.elements.find((e) => e.id === selectedId) ?? null;
  const flagged = page?.elements.filter((e) => e.fidelity?.flags?.length) ?? [];

  const go = (n: number) => {
    setPageNumber(Math.min(pageCount, Math.max(1, n)));
    setSelectedId(null);
  };

  const options = strategies.map((s) => ({ value: s, label: s }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => go((page?.page ?? 1) - 1)} disabled={!page || page.page <= 1} aria-label="Previous page">
            <ChevronLeft aria-hidden />
          </Button>
          <span className="text-sm tabular-nums">
            Page {page?.page ?? pageNumber} of {pageCount}
          </span>
          <Button variant="secondary" size="sm" onClick={() => go((page?.page ?? 1) + 1)} disabled={!page || page.page >= pageCount} aria-label="Next page">
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <SelectField label="Strategy" value={strategy} options={options} onChange={(v) => { setStrategy(v); setSelectedId(null); }} />
        <SelectField label="Compare with" value={compare} options={[{ value: "none" as const, label: "—" }, ...options.filter((o) => o.value !== strategy)]} onChange={setCompare} />
        <Legend />
      </div>

      {primary.error ? (
        <ErrorNote message={primary.error} />
      ) : primary.loading || !page ? (
        <div className="surface p-6"><SkeletonLines lines={8} /></div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div className={cn("grid gap-4", comparePage && "md:grid-cols-2")}>
            <PageCanvas page={page} label={strategy} selectedId={selectedId} onSelect={setSelectedId} />
            {comparePage ? <PageCanvas page={comparePage} label={compare as string} selectedId={null} onSelect={() => {}} /> : null}
          </div>
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {flagged.length ? (
              <InfoNote>
                ⚠ {flagged.length} flagged element{flagged.length > 1 ? "s" : ""} on this page (fidelity / share sums) — outlined dashed.
              </InfoNote>
            ) : null}
            {selected ? (
              <ElementPanel element={selected} groundTruth={groundTruth} />
            ) : (
              <ElementList elements={page.elements} onSelect={setSelectedId} />
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function Legend() {
  const types = ["text", "table", "chart", "footnote", "callout"] as const;
  return (
    <ul className="text-muted-foreground ml-auto flex flex-wrap items-center gap-3 text-[0.75rem]" aria-label="Legend">
      {types.map((t) => (
        <li key={t} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[3px] border-2" style={{ borderColor: TYPE_COLOURS[t] }} />
          {typeLabel(t)}
        </li>
      ))}
    </ul>
  );
}

/** The page image with an SVG overlay of element boxes (0–1000 coordinates). */
function PageCanvas({ page, label, selectedId, onSelect }: { page: PageData; label: string; selectedId: string | null; onSelect: (id: string) => void }) {
  const boxes = useMemo(() => page.elements.filter((e) => e.bbox), [page.elements]);
  return (
    <figure className="surface overflow-hidden p-2">
      <div className="relative" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- exact page raster, sized by the overlay */}
        <img src={page.imagePath} alt={`Page ${page.page}`} className="absolute inset-0 h-full w-full rounded-[10px] bg-white object-contain" />
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="group" aria-label={`Elements on page ${page.page}`}>
          {boxes.map((e) => {
            const [y0, x0, y1, x1] = e.bbox!;
            const selected = e.id === selectedId;
            const flagged = Boolean(e.fidelity?.flags?.length);
            return (
              <rect
                key={e.id}
                x={x0}
                y={y0}
                width={Math.max(1, x1 - x0)}
                height={Math.max(1, y1 - y0)}
                fill={selected ? TYPE_COLOURS[e.type] : "transparent"}
                fillOpacity={selected ? 0.12 : 0}
                stroke={TYPE_COLOURS[e.type]}
                strokeWidth={selected ? 3 : 1.5}
                strokeDasharray={flagged ? "6 4" : undefined}
                vectorEffect="non-scaling-stroke"
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                aria-label={`${typeLabel(e.type)}${e.title ? `: ${e.title}` : ""}`}
                onClick={() => onSelect(e.id)}
                onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && onSelect(e.id)}
              />
            );
          })}
        </svg>
      </div>
      <figcaption className="text-muted-foreground px-1 pt-2 text-[0.75rem]">
        {label} · {page.elements.length} elements{boxes.length < page.elements.length ? ` (${page.elements.length - boxes.length} without a box)` : ""}
      </figcaption>
    </figure>
  );
}

function ElementList({ elements, onSelect }: { elements: StoredElement[]; onSelect: (id: string) => void }) {
  if (elements.length === 0) return <InfoNote>No elements were extracted from this page.</InfoNote>;
  return (
    <div className="surface p-2">
      <p className="eyebrow px-2 pt-2 pb-1">Elements in reading order</p>
      <ol>
        {elements.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onSelect(e.id)} className="hover:bg-surface-2 flex w-full items-center gap-2 rounded-tight px-2 py-1.5 text-left text-[0.8125rem]">
              <TypeIcon type={e.type} />
              <span className="min-w-0 flex-1 truncate">{e.title ?? e.text?.slice(0, 80) ?? typeLabel(e.type)}</span>
              {e.fidelity?.flags?.length ? <span title={e.fidelity.flags.join("; ")}>⚠</span> : null}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
