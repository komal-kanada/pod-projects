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
import type { AskEvent, ElementSource, QueryAnalysis, TraceStage } from "@/lib/types";
import { AnalysisChips } from "../analysis-chips";
import { typeLabel } from "../type-icon";
import { SourceCard } from "./source-card";

interface Done {
  latencyMs: number;
  citations: number[];
  invalidCitations: number[];
  refused: boolean;
  disagreements: number[];
  images: number;
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
  const [sources, setSources] = useState<ElementSource[] | null>(null);
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
      return (
        <CitationBadge
          label={`${typeLabel(source.type)} · p.${source.page}`}
          title={source.title ?? undefined}
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
        placeholder={enabled ? "Ask about the report — emissions, energy use, materials, assumptions…" : "Available once the report is ingested"}
      >
        <SelectField label="Preset" value={preset} options={presets} onChange={setPreset} disabled={running} />
        <span className="text-muted-foreground ml-auto hidden text-[0.75rem] md:inline">M0 is the text-only baseline; each preset adds one technique</span>
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
                      <p className="text-muted-foreground mt-0.5">None of the retrieved elements answer this, so the app says so instead of guessing.</p>
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
                    <span>{sources?.length ?? 0} sources</span>
                    <span aria-hidden>·</span>
                    <span>{done.images} image{done.images === 1 ? "" : "s"}</span>
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
                <p className="eyebrow mb-3 px-1">Sources{sources ? ` (${sources.length})` : ""}</p>
                {sources === null ? (
                  <div className="surface p-4">
                    <SkeletonLines lines={3} />
                  </div>
                ) : sources.length === 0 ? (
                  <p className="text-muted-foreground bg-surface-2 rounded-panel p-4 text-sm">Nothing was retrieved.</p>
                ) : (
                  <ol className="space-y-2">
                    {sources.map((source) => (
                      <SourceCard
                        key={source.n}
                        source={source}
                        cited={done ? done.citations.includes(source.n) : null}
                        highlighted={highlight === source.n}
                        disagreement={done?.disagreements.includes(source.n) ?? false}
                        onCollapse={() => setHighlight(null)}
                      />
                    ))}
                  </ol>
                )}
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
    ["Find the element", "Search runs over row sentences, chart facts, footnotes and text — the forms that match questions."],
    ["Bring it whole", "A hit expands to its whole table or chart, with the footnotes that qualify it."],
    ["Check the image", "The model also sees the original crop, and says so if the extracted data disagrees."],
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
