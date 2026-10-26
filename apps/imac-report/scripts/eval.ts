/**
 * `pnpm eval [--presets M0,M1,M2,M3,M4] [--no-judge] [--only q01] [--category chart]`
 * QA ablation → eval/results/<time>-qa.{md,json}.
 */
import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { judgeCorrectness, judgeFaithfulness, JUDGE_PROMPT_VERSION } from "@pod/eval/judge";
import { timestampSlug } from "@pod/eval/report";
import { PRESET_IDS, type PresetId } from "../lib/config";
import { getActiveRuns } from "../lib/db/runs";
import { numericMatch, statesEstimateAsExact } from "../lib/eval/qa/numeric";
import { isLabelled, loadGoldSet } from "../lib/eval/qa/questions";
import { renderQaReport } from "../lib/eval/qa/report";
import { scoreRetrieval, summarise, type QaResult } from "../lib/eval/qa/score";
import { ANSWER_PROMPT_VERSION, DOCUMENT_NAME } from "../lib/prompts";
import { answerOnce } from "../lib/rag/answer";
import { loadImageParts } from "../lib/rag/images";
import { runRetrieval } from "../lib/retrieval/pipeline";
import { createServicesFromEnv } from "../lib/services";
import type { ChartSeries, ElementSource } from "../lib/types";
import { SCRIPT_RETRY } from "./shared";

const { values } = parseArgs({ options: { presets: { type: "string", default: "M0,M1,M2,M3,M4" }, "no-judge": { type: "boolean", default: false }, only: { type: "string" }, category: { type: "string" } } });
const presets = values.presets!.split(",").map((p) => p.trim()) as PresetId[];
if (presets.some((p) => !PRESET_IDS.includes(p))) {
  console.error(`--presets must be from ${PRESET_IDS.join(",")}`);
  process.exit(1);
}
const judge = !values["no-judge"];
const services = createServicesFromEnv(SCRIPT_RETRY);

function estimates(sources: ElementSource[]): string[] {
  return sources.flatMap((s) => (s.type === "chart" ? ((s.data?.series as ChartSeries[] | undefined) ?? []).flatMap((x) => x.points.filter((p) => p.valueSource === "estimated").map((p) => p.valueText)) : []));
}

try {
  const runs = await getActiveRuns(services.sql);
  const gold = await loadGoldSet();
  const only = values.only?.split(",");
  const questions = gold.questions.filter((q) => (!only || only.includes(q.id)) && (!values.category || q.category === values.category));
  if (questions.length === 0) throw new Error("No questions — add them to eval/questions.json.");

  const results: QaResult[] = [];
  for (const preset of presets) {
    console.log(`\n${preset} · ${questions.length} questions${judge ? " · with judge" : " · retrieval only"}`);
    for (const q of questions) {
      const labelled = isLabelled(q);
      try {
        if (!judge) {
          const outcome = await runRetrieval(services, runs, q.question, preset);
          const r = scoreRetrieval(q, preset, outcome.sources, labelled);
          results.push(r);
          console.log(`  ${q.id.padEnd(8)} Hit@6 ${r.hit6 ?? "–"}  MRR ${r.mrr?.toFixed(2) ?? "–"}`);
          continue;
        }
        const answer = await answerOnce(services, runs, q.question, { preset, source: "eval" });
        // Every later question would fail the same way — stop instead of recording N errors.
        if (answer.errorCode === "quota") throw new Error(`Stopped at ${q.id}: ${answer.error}`);
        const sources = answer.outcome?.sources ?? [];
        const r: QaResult = {
          ...scoreRetrieval(q, preset, sources, labelled),
          answer: answer.answer,
          refused: answer.refused,
          citations: answer.citations,
          disagreements: answer.disagreements,
          images: answer.outcome?.images.length ?? 0,
          latencyMs: answer.latencyMs,
          error: answer.error,
          estimatedAsExact: !answer.refused && statesEstimateAsExact(answer.answer, estimates(sources)),
        };
        if (q.category !== "out_of_scope" && labelled && !answer.error && answer.outcome) {
          r.numericMatch = numericMatch(answer.answer, q.expected_values);
          const footnotes = q.expected_elements.filter((e) => e.type === "footnote" && e.marker);
          r.footnoteUsed = footnotes.length
            ? answer.citations.some((n) => {
                const s = sources[n - 1];
                return s && footnotes.some((f) => s.title === `Footnote ${f.marker}` || s.footnotes.some((x) => x.marker === f.marker));
              })
              ? 1
              : 0
            : null;
          const verdict = await judgeCorrectness(services.gemini, { documentName: DOCUMENT_NAME, question: q.question, expectedAnswer: q.expected_answer ?? "", mustInclude: q.must_include, mustNotInclude: q.must_not_include, answer: answer.answer });
          r.correctness = verdict.score;
          r.correctnessReason = verdict.reason;
          if (!answer.refused) {
            // The faithfulness judge sees the same images the answer model saw.
            const images = await loadImageParts(answer.outcome.images);
            const faith = await judgeFaithfulness(services.gemini, { context: answer.outcome.contextText, answer: answer.answer, images });
            r.faithful = faith.faithful;
          }
        }
        results.push(r);
        console.log(`  ${q.id.padEnd(8)} Hit@6 ${r.hit6 ?? "–"}  correct ${r.correctness ?? "–"}  numeric ${r.numericMatch ?? "–"}${r.estimatedAsExact ? "  ESTIMATE-AS-EXACT" : ""}${r.refused ? "  refused" : ""}`);
      } catch (error) {
        console.log(`  ${q.id.padEnd(8)} ERROR ${(error as Error).message}`);
        results.push({ ...scoreRetrieval(q, preset, [], labelled), error: (error as Error).message });
      }
    }
  }

  let commit = "unknown";
  try {
    commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {}
  const header = {
    Date: new Date().toISOString().slice(0, 16).replace("T", " "),
    Runs: Object.entries(runs).map(([k, r]) => `${k} ${r!.id.slice(0, 8)}`).join(" · ") || "none",
    Mode: judge ? `full · prompt ${ANSWER_PROMPT_VERSION} · judge ${JUDGE_PROMPT_VERSION}` : "retrieval only",
    Commit: commit,
  };
  const base = `eval/results/${timestampSlug()}-qa${judge ? "" : "-retrieval"}`;
  await mkdir("eval/results", { recursive: true });
  await writeFile(`${base}.md`, renderQaReport({ header, presets, results, judged: judge }));
  await writeFile(`${base}.json`, JSON.stringify({ header, summaries: Object.fromEntries(presets.map((p) => [p, summarise(results.filter((r) => r.preset === p))])), results }, null, 2));
  console.log(`\nWrote ${base}.md and .json`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await services.sql.end();
}
