"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@pod/ui/rag/button";
import { ErrorNote, SkeletonLines, Tag } from "@pod/ui/rag/states";
import { pageLabel } from "@/lib/types";

interface BrowsedChunk {
  id: string;
  chunkIndex: number;
  content: string;
  embedText: string;
  sectionPath: string | null;
  pageStart: number;
  pageEnd: number;
  pageLabelStart: string | null;
  pageLabelEnd: string | null;
  charCount: number;
}

/**
 * "What does the pipeline think page 14 says?" — the first thing to check
 * when a page is never retrieved.
 */
export function ChunkBrowser({ firstPage, lastPage }: { firstPage: number; lastPage: number }) {
  const [page, setPage] = useState(firstPage);
  // Results are keyed by the page they belong to; anything else is "loading".
  const [loaded, setLoaded] = useState<{ page: number; chunks: BrowsedChunk[] | null; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chunks?page=${page}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Couldn't load chunks.");
        if (!cancelled) setLoaded({ page, chunks: payload.chunks, error: null });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoaded({ page, chunks: null, error: cause instanceof Error ? cause.message : "Couldn't load chunks." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  const current = loaded?.page === page ? loaded : null;
  const chunks = current?.chunks ?? null;
  const error = current?.error ?? null;

  const go = (target: number) => setPage(Math.min(lastPage, Math.max(firstPage, target)));

  return (
    <section aria-labelledby="chunk-browser">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="chunk-browser" className="text-[1.125rem] font-medium">
          Chunk browser
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => go(page - 1)} disabled={page <= firstPage} aria-label="Previous page">
            <ChevronLeft aria-hidden />
          </Button>
          <label className="text-muted-foreground flex items-center gap-2 text-[0.8125rem]">
            Page
            <input
              type="number"
              min={firstPage}
              max={lastPage}
              value={page}
              onChange={(event) => go(Number.parseInt(event.target.value, 10) || firstPage)}
              className="border-hairline bg-surface text-foreground h-8 w-20 rounded-full border px-3 tabular-nums"
            />
            <span>of {lastPage}</span>
          </label>
          <Button variant="secondary" size="sm" onClick={() => go(page + 1)} disabled={page >= lastPage} aria-label="Next page">
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {error ? (
          <ErrorNote message={error} />
        ) : chunks === null ? (
          <div className="surface p-5">
            <SkeletonLines lines={4} />
          </div>
        ) : chunks.length === 0 ? (
          <p className="text-muted-foreground bg-surface-2 rounded-panel p-4 text-sm">
            No chunk covers this page — it may have had no extractable text, or only header/footer lines.
          </p>
        ) : (
          chunks.map((chunk) => (
            <article key={chunk.id} className="surface p-5">
              <div className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
                <span className="font-medium tabular-nums">#{chunk.chunkIndex}</span>
                <Tag tone="brand">{pageLabel(chunk.pageLabelStart ?? chunk.pageStart, chunk.pageLabelEnd ?? chunk.pageEnd)}</Tag>
                <span className="text-muted-foreground truncate">{chunk.sectionPath || "No section"}</span>
                <span className="text-muted-foreground ml-auto tabular-nums">{chunk.charCount} chars</span>
              </div>
              <p className="excerpt mt-3 max-h-96 overflow-y-auto">{chunk.content}</p>
              <details className="mt-3">
                <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-[0.8125rem]">
                  Show embed_text (what was embedded)
                </summary>
                <p className="excerpt bg-surface-2 mt-2 max-h-72 overflow-y-auto rounded-tight p-3 font-mono text-[0.75rem]">
                  {chunk.embedText}
                </p>
              </details>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
