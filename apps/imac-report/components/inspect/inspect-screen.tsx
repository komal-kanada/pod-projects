"use client";

import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Button } from "@pod/ui/rag/button";
import { SelectField } from "@pod/ui/rag/select";
import { FailureNote, SkeletonLines, Tag } from "@pod/ui/rag/states";
import { RequestError } from "@pod/ui/rag/use-ndjson-stream";
import { Tabs } from "@pod/ui/rag/tabs";
import { formatMs } from "@pod/ui/rag/trace-panel";
import type { PresetId } from "@/lib/config";
import type { ChunkHit, ElementSource, QueryAnalysis, TraceStage } from "@/lib/types";
import { AnalysisChips } from "../analysis-chips";
import { TypeIcon, typeLabel } from "../type-icon";

interface Retrieved {
  preset: PresetId;
  analysis: QueryAnalysis | null;
  trace: TraceStage[];
  hits: (Omit<ChunkHit, "content"> & { preview: string })[];
  sources: ElementSource[];
  images: { n: number; path: string }[];
}

type Tab = "analysis" | "hits" | "context";

export function InspectScreen({ presets, defaultPreset, budget }: { presets: { value: PresetId; label: string }[]; defaultPreset: PresetId; budget: number }) {
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState<PresetId>(defaultPreset);
  const [result, setResult] = useState<Retrieved | null>(null);
  const [tab, setTab] = useState<Tab>("hits");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 3) return;
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const response = await fetch("/api/retrieve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: query.trim(), preset }) });
      const payload = await response.json();
      if (!response.ok) throw new RequestError(payload.error ?? "Retrieval failed.", payload.code ?? null);
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Retrieval failed.");
      setErrorCode(cause instanceof RequestError ? cause.code : null);
    } finally {
      setLoading(false);
    }
  }

  const tokens = result?.sources.reduce((sum, s) => sum + s.tokens, 0) ?? 0;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="surface flex flex-wrap items-center gap-2 p-2.5">
        <label htmlFor="inspect-query" className="sr-only">Query</label>
        <input id="inspect-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a question to trace its retrieval…" className="placeholder:text-muted-foreground/80 h-11 min-w-0 flex-1 basis-64 bg-transparent px-3 text-[0.9375rem] outline-none focus-visible:outline-none" />
        <SelectField label="Preset" value={preset} options={presets} onChange={setPreset} />
        <Button type="submit" size="sm" className="h-9" disabled={loading || query.trim().length < 3}>
          <Search aria-hidden />
          Trace
        </Button>
      </form>

      {error ? (
        <FailureNote message={error} code={errorCode} />
      ) : loading ? (
        <div className="surface p-5"><SkeletonLines lines={6} /></div>
      ) : result ? (
        <section className="surface p-4 sm:p-5">
          <p className="text-muted-foreground text-[0.8125rem]">{result.preset} · {result.trace.map((t) => `${t.stage} ${formatMs(t.ms)}`).join(" → ")}</p>
          <div className="mt-3">
            <Tabs<Tab>
              label="Retrieval stages"
              value={tab}
              onChange={setTab}
              tabs={[
                { value: "analysis", label: "Analysis" },
                { value: "hits", label: `Chunk hits (${result.hits.length})` },
                { value: "context", label: `Elements & context (${result.sources.length})` },
              ]}
            >
              {tab === "analysis" ? (
                result.analysis ? (
                  <div className="space-y-3">
                    <AnalysisChips analysis={result.analysis} />
                    <pre className="bg-surface-2 overflow-auto rounded-tight p-3 font-mono text-[0.75rem]">{JSON.stringify(result.analysis, null, 2)}</pre>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">This preset doesn’t analyse the query (M3+ does).</p>
                )
              ) : null}

              {tab === "hits" ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[0.8125rem]">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th scope="col" className="py-2 pr-3 font-medium">#</th>
                        <th scope="col" className="py-2 pr-3 font-medium">Kind</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">vRank</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">kRank</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">Score</th>
                        <th scope="col" className="py-2 pr-3 font-medium">Page</th>
                        <th scope="col" className="py-2 font-medium">Preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.hits.map((h, i) => (
                        <tr key={h.chunkId} className="border-hairline border-t align-top">
                          <td className="py-2 pr-3 tabular-nums">{i + 1}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{h.kind.replace("_", " ")}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{h.vectorRank ?? "–"}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{h.keywordRank ?? "–"}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{h.score.toFixed(4)}</td>
                          <td className="py-2 pr-3 tabular-nums">{h.page}</td>
                          <td className="text-muted-foreground py-2"><span className="line-clamp-2">{h.preview}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {tab === "context" ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-muted-foreground mb-1.5 flex justify-between text-[0.75rem] tabular-nums">
                      <span>Context budget · {result.images.length} image{result.images.length === 1 ? "" : "s"} attached</span>
                      <span>{tokens.toLocaleString()} / {budget.toLocaleString()} tokens</span>
                    </div>
                    <div className="bg-surface-2 flex h-2 overflow-hidden rounded-full" role="img" aria-label={`${tokens} of ${budget} tokens used`}>
                      {result.sources.map((s, i) => <span key={s.n} className={i % 2 ? "bg-brand/50" : "bg-brand/80"} style={{ width: `${(s.tokens / budget) * 100}%` }} />)}
                    </div>
                  </div>
                  <ol className="space-y-2">
                    {result.sources.map((s) => (
                      <li key={s.n} className="bg-surface-2/60 rounded-tight p-3 text-[0.8125rem]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium tabular-nums">[{s.n}]</span>
                          <Tag><TypeIcon type={s.type} className="size-3" />{typeLabel(s.type)}</Tag>
                          <Tag tone="brand">p. {s.page}</Tag>
                          <span className="text-muted-foreground tabular-nums">{s.tokens} tok · score {s.score.toFixed(4)}</span>
                          {s.imageAttached ? <Tag>image</Tag> : null}
                          {s.hitRows.length ? <Tag>rows {s.hitRows.map((r) => r + 1).join(", ")} matched</Tag> : null}
                          {s.footnotes.length ? <Tag>{s.footnotes.length} note(s)</Tag> : null}
                        </div>
                        {s.title ? <p className="mt-1.5 font-medium">{s.title}</p> : null}
                        <p className="text-muted-foreground mt-1 line-clamp-3 whitespace-pre-line">{s.text}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </Tabs>
          </div>
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">Shows how each chunk kind ranks (row sentences, chart facts, footnotes…), which whole elements they expand to, and which crops would go to the model.</p>
      )}
    </div>
  );
}
