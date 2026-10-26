/**
 * `pnpm eval [--run <id>] [--mode vector|hybrid] [--k 6] [--no-judge] [--only q01,q02]`
 *
 * Runs the gold set and writes eval/results/<time>-<run>-<mode>.{md,json}.
 * --no-judge runs retrieval only: no generation, no judge, seconds not minutes.
 */
import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { judgeCorrectness, judgeFaithfulness, JUDGE_PROMPT_VERSION } from "@pod/eval/judge";
import { timestampSlug } from "@pod/eval/report";
import { overlaps } from "@pod/eval/metrics";
import { DOCUMENT, RAG_CONFIG, type RetrievalMode } from "../lib/config";
import { getActiveRun, getRun, resolveRunId } from "../lib/db/runs";
import { isLabelled, loadGoldSet } from "../lib/eval/questions";
import { renderReport } from "../lib/eval/report";
import { scoreRetrieval, summarise, type QuestionResult } from "../lib/eval/score";
import { answerOnce } from "../lib/rag/answer";
import { ANSWER_PROMPT_VERSION } from "../lib/rag/prompts";
import { retrieve } from "../lib/retrieval/retrieve";
import { createServicesFromEnv } from "../lib/services";

const { values } = parseArgs({
  options: {
    run: { type: "string" },
    mode: { type: "string" },
    k: { type: "string" },
    "no-judge": { type: "boolean", default: false },
    only: { type: "string" },
  },
});

const services = createServicesFromEnv();
const judge = !values["no-judge"];
const mode = (values.mode ?? RAG_CONFIG.retrieval.mode) as RetrievalMode;
const topK = values.k ? Number.parseInt(values.k, 10) : RAG_CONFIG.retrieval.topK;

function commit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

try {
  const run = values.run ? await getRun(services.sql, await resolveRunId(services.sql, values.run)) : await getActiveRun(services.sql);
  if (!run) throw new Error("No ingestion run to evaluate. Ingest and activate one, or pass --run.");

  const gold = await loadGoldSet();
  const only = values.only?.split(",").map((id) => id.trim());
  const questions = gold.questions.filter((q) => !only || only.includes(q.id));
  if (questions.length === 0) throw new Error("No questions to run — add them to eval/questions.json.");

  console.log(`Evaluating ${questions.length} questions · run ${run.id.slice(0, 8)} · ${mode} · k=${topK}${judge ? " · with judge" : " · retrieval only"}\n`);
  const results: QuestionResult[] = [];

  for (const question of questions) {
    const labelled = isLabelled(question);
    if (!judge) {
      const retrieval = await retrieve(services, run, question.question, { mode, topK });
      const result = scoreRetrieval(question, retrieval.chunks, labelled);
      results.push(result);
      console.log(`  ${question.id.padEnd(8)} Hit@6 ${result.hit6 ?? "–"}  MRR ${result.mrr?.toFixed(2) ?? "–"}`);
      continue;
    }

    const answer = await answerOnce(services, run, question.question, { mode, topK, source: "eval" });

    // Every later question would fail the same way — stop instead of recording N errors.

    if (answer.errorCode === "quota") throw new Error(`Stopped at ${question.id}: ${answer.error}`);
    const chunks = answer.retrieval?.chunks ?? [];
    const result: QuestionResult = {
      ...scoreRetrieval(question, chunks, labelled),
      answer: answer.answer,
      refused: answer.refused,
      citations: answer.citations,
      invalidCitations: answer.invalidCitations,
      latencyMs: answer.latencyMs,
      firstTokenMs: answer.firstTokenMs,
      error: answer.error,
    };

    if (question.category !== "out_of_scope" && labelled && !answer.error) {
      result.citationHit = answer.citations.some((n) => {
        const chunk = chunks[n - 1];
        return chunk ? overlaps(chunk.pageStart, chunk.pageEnd, question.expected_pages) : false;
      })
        ? 1
        : 0;

      const verdict = await judgeCorrectness(services.gemini, {
        documentName: DOCUMENT.title,
        question: question.question,
        expectedAnswer: question.expected_answer ?? "",
        mustInclude: question.must_include,
        mustNotInclude: question.must_not_include,
        answer: answer.answer,
      });
      result.correctness = verdict.score;
      result.correctnessReason = verdict.reason;

      if (!answer.refused) {
        const faith = await judgeFaithfulness(services.gemini, { context: answer.context, answer: answer.answer });
        result.faithful = faith.faithful;
        result.unsupportedClaims = faith.claims.filter((c) => !c.supported).map((c) => c.claim);
      }
    }

    results.push(result);
    console.log(
      `  ${question.id.padEnd(8)} Hit@6 ${result.hit6 ?? "–"}  correct ${result.correctness ?? "–"}  faithful ${result.faithful ?? "–"}${result.refused ? "  refused" : ""}${result.error ? `  ERROR ${result.error}` : ""}`,
    );
  }

  const stamp = timestampSlug();
  const base = `eval/results/${stamp}-${run.id.slice(0, 8)}-${mode}${judge ? "" : "-retrieval"}`;
  const chunk = (run.config as { chunk?: { targetChars: number; overlapChars: number; contextualHeader: boolean } }).chunk;
  const header = {
    Date: new Date().toISOString().slice(0, 16).replace("T", " "),
    "Ingestion run": `${run.id.slice(0, 8)} (chunk ${chunk?.targetChars} / overlap ${chunk?.overlapChars}, header ${chunk?.contextualHeader ? "on" : "off"}, ${run.embeddingModel} ${run.embeddingDims}-d)`,
    Retrieval: `${mode}, k=${topK}`,
    Generator: judge ? `${services.gemini.generationModel} · prompt ${ANSWER_PROMPT_VERSION} · judge ${JUDGE_PROMPT_VERSION}` : "— (retrieval only)",
    Commit: commit(),
  };

  await mkdir("eval/results", { recursive: true });
  await writeFile(`${base}.md`, renderReport({ header, results, judged: judge }));
  await writeFile(`${base}.json`, JSON.stringify({ header, config: run.config, summary: summarise(results), results }, null, 2));

  const summary = summarise(results);
  console.log(`\nHit@6 ${summary.hit6?.toFixed(2) ?? "–"} · MRR ${summary.mrr?.toFixed(2) ?? "–"}${judge ? ` · correctness ${summary.correctness?.toFixed(2) ?? "–"} · faithfulness ${summary.faithfulness?.toFixed(2) ?? "–"}` : ""}`);
  console.log(`Wrote ${base}.md and .json`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await services.sql.end();
}
