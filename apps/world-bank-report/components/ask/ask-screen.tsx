"use client";

import { useCallback, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { AnswerMarkdown } from "@pod/ui/rag/answer-markdown";
import { Button } from "@pod/ui/rag/button";
import { CitationBadge } from "@pod/ui/rag/citation-badge";
import { QuestionForm } from "@pod/ui/rag/question-form";
import { SampleQuestions } from "@pod/ui/rag/sample-questions";
import { SelectField } from "@pod/ui/rag/select";
import { FailureNote, InfoNote, SkeletonLines } from "@pod/ui/rag/states";
import { TracePanel, formatMs } from "@pod/ui/rag/trace-panel";
import { RequestError, useNdjsonStream } from "@pod/ui/rag/use-ndjson-stream";
import type { PresetId } from "@/lib/config";
import type { AskEvent, ContextSource, QueryAnalysis, TraceStage } from "@/lib/types";
import { PATH_SEPARATOR } from "@/lib/types";
import { AnalysisChips } from "../analysis-chips";
import { SourcesBySection } from "./sources-by-section";

interface Done {
  latencyMs: number;
  citations: number[];
  invalidCitations: number[];
  refused: boolean;
  contextTokens: number;
}

export function AskScreen({
  samples,
  enabled,
  presets,
  defaultPreset,
}: {
  samples: string[];
  enabled: boolean;
  presets: { value: PresetId; label: string }[];
  defaultPreset: PresetId;
}) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<{ question: string; preset: PresetId } | null>(null);
  const [preset, setPreset] = useState<PresetId>(defaultPreset);
  const [analysis, setAnalysis] = useState<QueryAnalysis | null>(null);
  const [sources, setSources] = useState<ContextSource[] | null>(null);
  const [trace, setTrace] = useState<TraceStage[]>([]);
  const [answer, setAnswer] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { run, cancel, running } = useNdjsonStream<AskEvent>();

  const ask = useCallback(
    async (text: string) => {
      setAsked({ question: text, preset });
      setQuestion(text);
      setAnalysis(null);
      setSources(null);
      setTrace([]);
      setAnswer("");
      setDone(null);
      setError(null);
      setErrorCode(null);
      setHighlight(null);
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      try {
        await run("/api/ask", { question: text, preset }, (event) => {
          if (event.type === "analysis") setAnalysis(event.analysis);
          else if (event.type === "sources") setSources(event.sources);
          else if (event.type === "trace") setTrace(event.trace);
          else if (event.type === "token") setAnswer((current) => current + event.text);
          else if (event.type === "done") setDone(event);
          else if (event.type === "error") {
            setError(event.message);
            setErrorCode(event.code ?? null);
          }
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Something went wrong.");
        setErrorCode(cause instanceof RequestError ? cause.code : null);
      }
    },
    [run, preset],
  );

  const showCitation = useCallback(
    (n: number) => {
      const source = sources?.[n - 1];
      if (!source) return <CitationBadge label={`[${n}]`} title="This reference doesn't match a source" invalid />;
      const name = source.title ?? source.sectionPath.at(-1) ?? "Report";
      return (
        <CitationBadge
          label={`${name.length > 28 ? `${name.slice(0, 26)}…` : name} · ${source.pageLabel}`}
          title={source.sectionPath.join(PATH_SEPARATOR)}
          onClick={() => {
            setHighlight(n);
            document.getElementById(`source-${n}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }}
        />
      );
    },
    [sources],
  );

  return (
    <div>
      <QuestionForm
        value={question}
        onChange={setQuestion}
        onSubmit={ask}
        onStop={cancel}
        busy={running || !enabled}
        placeholder={enabled ? "Ask about the report — figures, regions, forecasts, risks…" : "Available once the report is ingested"}
      >
        <SelectField label="Preset" value={preset} options={presets} onChange={setPreset} disabled={running} />
        <span className="text-muted-foreground ml-auto hidden text-[0.75rem] md:inline">B0 is the baseline; each preset adds one technique</span>
      </QuestionForm>

      <SampleQuestions questions={samples} onPick={ask} disabled={running || !enabled} />

      <div ref={resultsRef} className="scroll-mt-24">
        {asked === null ? (
          <EmptyState />
        ) : (
          <>
            {analysis ? (
              <div className="animate-fade mt-7">
                <AnalysisChips analysis={analysis} />
              </div>
            ) : null}
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
              <section aria-label="Answer" aria-busy={running} className="surface animate-fade min-w-0 p-5 sm:p-7">
                <p className="eyebrow">Answer · {asked.preset}</p>
                <h2 className="mt-2 text-[1.0625rem] leading-snug font-medium">{asked.question}</h2>
                <div className="mt-5">
                  {error ? (
                    <FailureNote
                      message={error}
                      code={errorCode}
                      action={
                        <Button variant="secondary" size="sm" onClick={() => ask(asked.question)}>
                          <RotateCcw aria-hidden />
                          Try again
                        </Button>
                      }
                    />
                  ) : done?.refused ? (
                    <InfoNote>
                      <p className="font-medium">Not in the report</p>
                      <p className="text-muted-foreground mt-0.5">The retrieved sections don’t answer this, so the app says so instead of guessing.</p>
                    </InfoNote>
                  ) : answer ? (
                    <AnswerMarkdown text={answer} renderCitation={showCitation} streaming={running && !done} />
                  ) : (
                    <SkeletonLines lines={4} />
                  )}
                </div>
                {done && !error ? (
                  <p className="text-muted-foreground border-hairline mt-6 flex flex-wrap gap-x-3 gap-y-1 border-t pt-4 text-[0.8125rem] tabular-nums">
                    <span>{formatMs(done.latencyMs)}</span>
                    <span aria-hidden>·</span>
                    <span>{(done.contextTokens / 1000).toFixed(1)}k context tokens</span>
                    <span aria-hidden>·</span>
                    <span>{sources?.length ?? 0} sources</span>
                    {done.invalidCitations.length ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-destructive">{done.invalidCitations.length} invalid citation(s)</span>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </section>

              <section aria-label="Sources" className="min-w-0">
                <p className="eyebrow mb-3 px-1">Sources by section{sources ? ` (${sources.length})` : ""}</p>
                <SourcesBySection sources={sources} cited={done?.citations ?? null} highlight={highlight} onClearHighlight={() => setHighlight(null)} />
              </section>
            </div>
            <TracePanel stages={trace} />
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  const steps = [
    ["Understand", "The question is analysed: intent, regions, years, and sub-questions for comparisons."],
    ["Find small", "Hybrid search over small chunks, tables and figures, with soft metadata filters and a rerank."],
    ["Answer big", "Hits expand to their sections, fitted to a token budget, in document order."],
  ];
  return (
    <ol className="mt-10 grid gap-3 sm:grid-cols-3">
      {steps.map(([title, body], index) => (
        <li key={title} className="bg-surface-2 rounded-panel p-5">
          <span className="text-muted-foreground text-[0.75rem] tabular-nums">0{index + 1}</span>
          <p className="mt-1.5 text-[0.9375rem] font-medium">{title}</p>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{body}</p>
        </li>
      ))}
    </ol>
  );
}
