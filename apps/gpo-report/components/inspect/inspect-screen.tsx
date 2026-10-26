"use client";

import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Button } from "@pod/ui/rag/button";
import { SelectField } from "@pod/ui/rag/select";
import { FailureNote, SkeletonLines } from "@pod/ui/rag/states";
import { RequestError } from "@pod/ui/rag/use-ndjson-stream";
import type { RetrievalResult } from "@/lib/types";
import { ChunkBrowser } from "./chunk-browser";
import { RetrievalTable } from "./retrieval-table";

type Mode = "vector" | "hybrid";

export function InspectScreen({ firstPage, lastPage }: { firstPage: number; lastPage: number }) {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState("6");
  const [mode, setMode] = useState<Mode>("vector");
  const [result, setResult] = useState<RetrievalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 3) return;
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const response = await fetch("/api/retrieve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: query.trim(), topK: Number(topK), mode }),
      });
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

  return (
    <div className="space-y-10">
      <section aria-label="Retrieval">
        <form onSubmit={search} className="surface flex flex-wrap items-center gap-2 p-2.5">
          <label htmlFor="inspect-query" className="sr-only">
            Query
          </label>
          <input
            id="inspect-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a question to see what it retrieves…"
            className="placeholder:text-muted-foreground/80 h-11 min-w-0 flex-1 basis-64 bg-transparent px-3 text-[0.9375rem] outline-none focus-visible:outline-none"
          />
          <SelectField label="k" value={topK} options={["4", "6", "8", "12"].map((v) => ({ value: v, label: v }))} onChange={setTopK} />
          <SelectField
            label="mode"
            value={mode}
            options={[
              { value: "vector", label: "Vector" },
              { value: "hybrid", label: "Hybrid" },
            ]}
            onChange={setMode}
          />
          <Button type="submit" disabled={loading || query.trim().length < 3} size="sm" className="h-9">
            <Search aria-hidden />
            Search
          </Button>
        </form>

        <div className="mt-5">
          {error ? (
            <FailureNote message={error} code={errorCode} />
          ) : loading ? (
            <div className="surface p-5">
              <SkeletonLines lines={5} />
            </div>
          ) : result ? (
            <RetrievalTable result={result} />
          ) : (
            <p className="text-muted-foreground text-sm">Results show rank, score and pages for each retrieved chunk.</p>
          )}
        </div>
      </section>

      <ChunkBrowser firstPage={firstPage} lastPage={lastPage} />
    </div>
  );
}
