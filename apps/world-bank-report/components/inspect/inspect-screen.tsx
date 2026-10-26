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
import type { Candidate, ContextSource, QueryAnalysis, TraceStage } from "@/lib/types";
import { PATH_SEPARATOR } from "@/lib/types";
import { AnalysisChips } from "../analysis-chips";

interface Retrieved {
  preset: PresetId;
  analysis: QueryAnalysis | null;
  trace: TraceStage[];
  candidates: (Omit<Candidate, "content"> & { preview: string; queries?: number[]; fused?: number })[];
  final: string[];
  sources: ContextSource[];
  tokens: { analysis: number; rerank: number };
}

type Tab = "analysis" | "candidates" | "rerank" | "context";

async function retrieve(question: string, preset: PresetId): Promise<Retrieved> {
  const response = await fetch("/api/retrieve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, preset }),
  });
  const payload = await response.json();
  if (!response.ok) throw new RequestError(payload.error ?? "Retrieval failed.", payload.code ?? null);
  return payload;
}

export function InspectScreen({ presets, defaultPreset, budget }: { presets: { value: PresetId; label: string }[]; defaultPreset: PresetId; budget: number }) {
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState<PresetId>(defaultPreset);
  const [compare, setCompare] = useState<PresetId | "none">("none");
  const [results, setResults] = useState<Retrieved[] | null>(null);
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
      const wanted = compare === "none" ? [preset] : [preset, compare];
      setResults(await Promise.all(wanted.map((p) => retrieve(query.trim(), p))));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Retrieval failed.");
      setErrorCode(cause instanceof RequestError ? cause.code : null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="surface flex flex-wrap items-center gap-2 p-2.5">
        <label htmlFor="inspect-query" className="sr-only">Query</label>
        <input
          id="inspect-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type a question to trace its retrieval…"
          className="placeholder:text-muted-foreground/80 h-11 min-w-0 flex-1 basis-64 bg-transparent px-3 text-[0.9375rem] outline-none focus-visible:outline-none"
        />
        <SelectField label="Preset" value={preset} options={presets} onChange={setPreset} />
        <SelectField label="Compare" value={compare} options={[{ value: "none" as const, label: "—" }, ...presets]} onChange={setCompare} />
        <Button type="submit" size="sm" className="h-9" disabled={loading || query.trim().length < 3}>
          <Search aria-hidden />
          Trace
        </Button>
      </form>

      {error ? (
        <FailureNote message={error} code={errorCode} />
      ) : loading ? (
        <div className="surface p-5"><SkeletonLines lines={6} /></div>
      ) : results ? (
        <div className={results.length > 1 ? "grid gap-5 xl:grid-cols-2" : ""}>
          {results.map((result) => (
            <PresetResult key={result.preset} result={result} budget={budget} compact={results.length > 1} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Shows the analysis, every candidate with its vector and keyword rank, rerank scores, and the final assembled context.</p>
      )}
    </div>
  );
}

function PresetResult({ result, budget, compact }: { result: Retrieved; budget: number; compact: boolean }) {
  const [tab, setTab] = useState<Tab>(compact ? "context" : result.analysis ? "analysis" : "candidates");
  const rerankStage = result.trace.find((t) => t.stage === "rerank");
  const rerankRows = Array.isArray(rerankStage?.details) ? (rerankStage!.details as { id: string; section: string; score: number; kept: boolean }[]) : null;
  const tokens = result.sources.reduce((sum, s) => sum + s.tokens, 0);
  const finalIds = new Set(result.final);

  return (
    <section className="surface min-w-0 p-4 sm:p-5" aria-label={`Preset ${result.preset}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[1.0625rem] font-medium">{result.preset}</h2>
        <span className="text-muted-foreground text-[0.8125rem]">
          {result.trace.map((t) => `${t.stage} ${formatMs(t.ms)}`).join(" → ")}
        </span>
      </div>

      <div className="mt-4">
        <Tabs<Tab>
          label="Retrieval stages"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "analysis", label: "Analysis" },
            { value: "candidates", label: `Candidates (${result.candidates.length})` },
            { value: "rerank", label: "Rerank" },
            { value: "context", label: `Context (${result.sources.length})` },
          ]}
        >
          {tab === "analysis" ? (
            result.analysis ? (
              <div className="space-y-3">
                <AnalysisChips analysis={result.analysis} />
                <pre className="bg-surface-2 overflow-auto rounded-tight p-3 font-mono text-[0.75rem]">{JSON.stringify(result.analysis, null, 2)}</pre>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">This preset doesn’t analyse the query (B4+ does).</p>
            )
          ) : null}

          {tab === "candidates" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[0.8125rem]">
                <thead className="text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">#</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">vRank</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">kRank</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Type</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Pages</th>
                    <th scope="col" className="py-2 font-medium">Section · preview</th>
                  </tr>
                </thead>
                <tbody>
                  {result.candidates.map((c, i) => (
                    <tr key={c.chunkId} className={`border-hairline border-t align-top ${finalIds.has(c.chunkId) ? "" : "opacity-60"}`}>
                      <td className="py-2 pr-3 tabular-nums">{i + 1}{finalIds.has(c.chunkId) ? " ✓" : ""}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.vectorRank ?? "–"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.keywordRank ?? "–"}</td>
                      <td className="py-2 pr-3">{c.contentType}</td>
                      <td className="py-2 pr-3 tabular-nums whitespace-nowrap">{c.pageLabelStart}{c.pageLabelEnd !== c.pageLabelStart ? `–${c.pageLabelEnd}` : ""}</td>
                      <td className="py-2">
                        <p className="font-medium">{c.title ?? (c.sectionPath.join(PATH_SEPARATOR) || "—")}</p>
                        <p className="text-muted-foreground mt-0.5 line-clamp-2">{c.preview}</p>
                        {c.regions.length || c.years.length ? <p className="text-muted-foreground mt-0.5 text-[0.75rem]">{[c.regions.join(", "), c.years.slice(0, 5).join(", ")].filter(Boolean).join(" · ")}</p> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-muted-foreground mt-2 text-[0.75rem]">✓ = kept for context</p>
            </div>
          ) : null}

          {tab === "rerank" ? (
            rerankRows ? (
              <ol className="space-y-1 text-[0.8125rem]">
                {[...rerankRows].sort((a, b) => b.score - a.score).map((row) => (
                  <li key={row.id} className={`flex items-center gap-3 ${row.kept ? "" : "opacity-55"}`}>
                    <span className="w-8 text-right font-medium tabular-nums">{row.score}</span>
                    <span className="bg-surface-2 h-1.5 w-24 shrink-0 overflow-hidden rounded-full" aria-hidden>
                      <span className="bg-brand/70 block h-full" style={{ width: `${row.score * 10}%` }} />
                    </span>
                    <span className="min-w-0 truncate">{row.section || "—"}</span>
                    {row.kept ? <Tag tone="positive">kept</Tag> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground text-sm">{rerankStage ? rerankStage.summary : "This preset doesn’t rerank (B5+ does)."}</p>
            )
          ) : null}

          {tab === "context" ? (
            <div className="space-y-3">
              <div>
                <div className="text-muted-foreground mb-1.5 flex justify-between text-[0.75rem] tabular-nums">
                  <span>Context budget</span>
                  <span>{tokens.toLocaleString()} / {budget.toLocaleString()} tokens</span>
                </div>
                <div className="bg-surface-2 flex h-2 overflow-hidden rounded-full" role="img" aria-label={`${tokens} of ${budget} tokens used`}>
                  {result.sources.map((s, i) => (
                    <span key={s.n} className={i % 2 ? "bg-brand/50" : "bg-brand/80"} style={{ width: `${(s.tokens / budget) * 100}%` }} />
                  ))}
                </div>
              </div>
              <ol className="space-y-2">
                {result.sources.map((s) => (
                  <li key={s.n} className="bg-surface-2/60 rounded-tight p-3 text-[0.8125rem]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium tabular-nums">[{s.n}]</span>
                      <Tag>{s.contentType}</Tag>
                      <Tag tone="brand">{s.pageLabel}</Tag>
                      <span className="text-muted-foreground tabular-nums">{s.tokens} tok · {s.chunkIds.length} chunk{s.chunkIds.length > 1 ? "s" : ""}</span>
                    </div>
                    <p className="mt-1.5 font-medium">{s.title ?? (s.sectionPath.join(PATH_SEPARATOR) || "Report")}</p>
                    <p className="text-muted-foreground mt-1 line-clamp-3">{s.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </Tabs>
      </div>
    </section>
  );
}
