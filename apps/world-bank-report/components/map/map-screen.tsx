"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@pod/ui/cn";
import { ErrorNote, InfoNote, SkeletonLines, Tag } from "@pod/ui/rag/states";
import type { SectionRow } from "@/lib/db/sections";
import type { BrowsedChunk } from "@/lib/db/chunks";
import { REGIONS } from "@/lib/metadata/vocab";
import { PATH_SEPARATOR } from "@/lib/types";

interface TreeNode extends SectionRow {
  children: TreeNode[];
}

function buildTree(rows: SectionRow[]): TreeNode[] {
  const nodes = new Map(rows.map((row) => [row.id, { ...row, children: [] as TreeNode[] }]));
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  // The "Report" root's children are the top level.
  return roots.length === 1 && roots[0].level === 0 ? roots[0].children : roots;
}

export function MapScreen({ sections }: { sections: SectionRow[] }) {
  const tree = useMemo(() => buildTree(sections), [sections]);
  const [selectedId, setSelectedId] = useState<string | null>(tree[0]?.id ?? null);
  const selected = sections.find((s) => s.id === selectedId) ?? null;
  const report = sections.find((s) => s.level === 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <nav aria-label="Sections" className="surface max-h-[75dvh] overflow-y-auto p-2 lg:sticky lg:top-24">
        {report?.summary ? (
          <button
            type="button"
            onClick={() => setSelectedId(report.id)}
            className={cn("hover:bg-surface-2 w-full rounded-tight px-3 py-2 text-left text-sm font-medium", selectedId === report.id && "bg-surface-2")}
          >
            Whole report
          </button>
        ) : null}
        <ul role="tree" aria-label="Report structure">
          {tree.map((node) => (
            <TreeItem key={node.id} node={node} selectedId={selectedId} onSelect={setSelectedId} depth={0} />
          ))}
        </ul>
      </nav>
      <div className="min-w-0">{selected ? <SectionDetail section={selected} /> : null}</div>
    </div>
  );
}

function TreeItem({ node, selectedId, onSelect, depth }: { node: TreeNode; selectedId: string | null; onSelect: (id: string) => void; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = node.children.length > 0;
  const selected = node.id === selectedId;

  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={selected}>
      <div className={cn("flex items-center rounded-tight", selected ? "bg-brand-soft" : "hover:bg-surface-2")} style={{ paddingLeft: depth * 14 }}>
        {hasChildren ? (
          <button type="button" onClick={() => setOpen(!open)} aria-label={open ? `Collapse ${node.title}` : `Expand ${node.title}`} className="text-muted-foreground flex size-7 shrink-0 items-center justify-center">
            <ChevronRight className={cn("size-3.5 transition-transform duration-150", open && "rotate-90")} aria-hidden />
          </button>
        ) : (
          <span className="size-7 shrink-0" aria-hidden />
        )}
        <button type="button" onClick={() => onSelect(node.id)} className={cn("min-w-0 flex-1 truncate py-1.5 pr-2 text-left text-[0.8125rem]", selected && "text-brand-text font-medium", !node.retrievable && "text-muted-foreground line-through decoration-1")}>
          {node.kind === "box" ? "▣ " : ""}
          {node.title}
        </button>
        <span className="text-muted-foreground shrink-0 pr-2 text-[0.6875rem] tabular-nums">{node.pageStart}</span>
      </div>
      {hasChildren && open ? (
        <ul role="group">
          {node.children.map((child) => (
            <TreeItem key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function SectionDetail({ section }: { section: SectionRow }) {
  const [loaded, setLoaded] = useState<{ id: string; chunks: BrowsedChunk[] | null; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chunks?sectionId=${section.id}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Couldn't load chunks.");
        if (!cancelled) setLoaded({ id: section.id, chunks: payload.chunks, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({ id: section.id, chunks: null, error: error instanceof Error ? error.message : "Couldn't load chunks." });
      });
    return () => {
      cancelled = true;
    };
  }, [section.id]);

  const current = loaded?.id === section.id ? loaded : null;
  const pages = section.pageStart === section.pageEnd ? `p. ${section.pageStart}` : `pp. ${section.pageStart}–${section.pageEnd}`;

  return (
    <article className="space-y-5">
      <header className="surface p-5 sm:p-6">
        <p className="text-muted-foreground text-[0.8125rem]">{section.path.slice(0, -1).join(PATH_SEPARATOR) || "Report"}</p>
        <h2 className="mt-1 text-[1.25rem] font-medium">{section.level === 0 ? "Whole report" : section.title}</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Tag tone="brand">{pages}</Tag>
          <Tag>{section.tokenCount.toLocaleString()} tokens</Tag>
          <Tag>{section.chunkCount} chunks</Tag>
          <Tag>{section.kind.replace("_", " ")}</Tag>
          {section.regions.map((code) => (
            <Tag key={code}>{REGIONS[code]?.name ?? code}</Tag>
          ))}
          {!section.retrievable ? <Tag tone="caution">excluded from retrieval</Tag> : null}
        </div>
        {section.summary ? (
          <div className="bg-surface-2 mt-5 rounded-panel p-4">
            <p className="eyebrow">Summary · generated, used for routing, never cited</p>
            <p className="mt-2 text-[0.9375rem] leading-relaxed">{section.summary}</p>
          </div>
        ) : null}
      </header>

      <section aria-label="Chunks">
        <p className="eyebrow mb-3 px-1">Chunks in this section</p>
        {current?.error ? (
          <ErrorNote message={current.error} />
        ) : !current ? (
          <div className="surface p-5">
            <SkeletonLines lines={3} />
          </div>
        ) : current.chunks!.length === 0 ? (
          <InfoNote>No chunks directly in this section — open a sub-section.</InfoNote>
        ) : (
          <ol className="space-y-2.5">
            {current.chunks!.map((chunk) => (
              <li key={chunk.id} className="surface p-4">
                <div className="flex flex-wrap items-center gap-1.5 text-[0.8125rem]">
                  <span className="font-medium tabular-nums">#{chunk.chunkIndex}</span>
                  <Tag>{chunk.contentType}</Tag>
                  <Tag tone="brand">p. {chunk.pageLabelStart}{chunk.pageLabelEnd !== chunk.pageLabelStart ? `–${chunk.pageLabelEnd}` : ""}</Tag>
                  {chunk.years.length ? <span className="text-muted-foreground">{chunk.years.join(", ")}</span> : null}
                  {chunk.isForecast ? <Tag tone="caution">forecast</Tag> : null}
                  {chunk.parseSource === "text_layer" ? <Tag tone="caution">⚠ text-layer fallback</Tag> : null}
                  <span className="text-muted-foreground ml-auto tabular-nums">{chunk.tokenCount} tok</span>
                </div>
                {chunk.title ? <p className="mt-2 text-sm font-medium">{chunk.title}</p> : null}
                <p className="excerpt text-muted-foreground mt-2 line-clamp-6">{chunk.content}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}
