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
import { formatMs } from "@pod/ui/rag/trace-panel";
import { RequestError, useNdjsonStream } from "@pod/ui/rag/use-ndjson-stream";
import type { AnswerSource, AskEvent } from "@/lib/types";
import { SourcesPanel } from "./sources-panel";

type Mode = "vector" | "hybrid";

interface Done {
  latencyMs: number;
  citations: number[];
  invalidCitations: number[];
  refused: boolean;
}

const K_OPTIONS = ["4", "6", "8", "12"].map((value) => ({ value, label: value }));
const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "vector", label: "Vector" },
  { value: "hybrid", label: "Hybrid" },
];

export function AskScreen({ samples, enabled }: { samples: string[]; enabled: boolean }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [topK, setTopK] = useState("6");
  const [mode, setMode] = useState<Mode>("vector");
  const [sources, setSources] = useState<AnswerSource[] | null>(null);
  const [answer, setAnswer] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { run, cancel, running } = useNdjsonStream<AskEvent>();

  const ask = useCallback(
    async (text: string) => {
      setAsked(text);
      setQuestion(text);
      setSources(null);
      setAnswer("");
      setDone(null);
      setError(null);
      setErrorCode(null);
      setHighlight(null);
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

      try {
        await run("/api/ask", { question: text, topK: Number(topK), mode }, (event) => {
          if (event.type === "sources") setSources(event.sources);
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
    [run, topK, mode],
  );

  const showCitation = useCallback(
    (n: number) => {
      const source = sources?.[n - 1];
      if (!source) {
        return <CitationBadge label={`[${n}]`} title="This reference doesn't match a retrieved passage" invalid />;
      }
      return (
        <CitationBadge
          label={source.pageLabel}
          title={source.section ?? undefined}
          onClick={() => {
            setHighlight(n);
            document.getElementById(`source-${n}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }}
        />
      );
    },
    [sources],
  );

  const streaming = running && sources !== null;

  return (
    <div>
      <QuestionForm
        value={question}
        onChange={setQuestion}
        onSubmit={ask}
        onStop={cancel}
        busy={running || !enabled}
        placeholder={enabled ? "Ask a question about the GPO Annual Report…" : "Available once the report is ingested"}
      >
        <SelectField label="Top k" value={topK} options={K_OPTIONS} onChange={setTopK} disabled={running} />
        <SelectField label="Retrieval" value={mode} options={MODE_OPTIONS} onChange={setMode} disabled={running} />
        <span className="text-muted-foreground ml-auto hidden text-[0.75rem] sm:inline">
          Enter to ask · Shift+Enter for a new line
        </span>
      </QuestionForm>

      <SampleQuestions questions={samples} onPick={ask} disabled={running || !enabled} />

      <div ref={resultsRef} className="scroll-mt-24">
        {asked === null ? (
          <EmptyState />
        ) : (
          <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
            <section aria-label="Answer" aria-busy={running} className="surface animate-fade p-5 sm:p-7">
              <p className="eyebrow">Answer</p>
              <h2 className="mt-2 text-[1.0625rem] leading-snug font-medium">{asked}</h2>

              <div className="mt-5">
                {error ? (
                  <FailureNote
                    message={error}
                    code={errorCode}
                    action={
                      <Button variant="secondary" size="sm" onClick={() => ask(asked)}>
                        <RotateCcw aria-hidden />
                        Try again
                      </Button>
                    }
                  />
                ) : done?.refused ? (
                  <InfoNote>
                    <p className="font-medium">Not in the report</p>
                    <p className="text-muted-foreground mt-0.5">
                      None of the retrieved passages answer this, so the app says so instead of guessing.
                    </p>
                  </InfoNote>
                ) : answer ? (
                  <AnswerMarkdown text={answer} renderCitation={showCitation} streaming={streaming} />
                ) : (
                  <SkeletonLines lines={4} />
                )}
              </div>

              {done && !error ? (
                <p className="text-muted-foreground border-hairline mt-6 flex flex-wrap gap-x-3 gap-y-1 border-t pt-4 text-[0.8125rem] tabular-nums">
                  <span>{formatMs(done.latencyMs)}</span>
                  <span aria-hidden>·</span>
                  <span>{sources?.length ?? 0} passages</span>
                  <span aria-hidden>·</span>
                  <span>{mode}</span>
                  {done.invalidCitations.length ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="text-destructive">{done.invalidCitations.length} invalid citation(s) dropped</span>
                    </>
                  ) : null}
                </p>
              ) : null}
            </section>

            <SourcesPanel
              sources={sources}
              cited={done?.citations ?? null}
              highlight={highlight}
              onHighlight={setHighlight}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  const steps = [
    ["Retrieve", "Your question is embedded and matched against every passage of the report."],
    ["Ground", "The closest passages — usually six — are handed to Gemini, numbered."],
    ["Answer", "Gemini answers only from them and cites each claim with its page."],
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
