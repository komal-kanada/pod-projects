/**
 * `pnpm eval [--presets B0,B3,B5] [--no-judge] [--only q01,q07] [--category numeric_table]`
 *
 * The ablation: every chosen preset over the gold set →
 * eval/results/<time>-ablation.{md,json}. Retrieval-only (--no-judge) first;
 * the full judge on the contenders.
 */
import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { judgeCorrectness, judgeFaithfulness, JUDGE_PROMPT_VERSION } from "@pod/eval/judge";
import { overlaps } from "@pod/eval/metrics";
import { timestampSlug } from "@pod/eval/report";
import { PRESET_IDS, type PresetId } from "../lib/config";
import { getActiveRuns } from "../lib/db/runs";
import { isLabelled, loadGoldSet } from "../lib/eval/questions";
import { renderAblation } from "../lib/eval/report";
import { scoreRetrieval, summarise, type QuestionResult } from "../lib/eval/score";
import { ANSWER_PROMPT_VERSION, DOCUMENT_NAME, JUDGE_EXTRA_RULES } from "../lib/prompts";
import { answerOnce } from "../lib/rag/answer";
import { runRetrieval } from "../lib/retrieval/pipeline";
import { SCRIPT_RETRY } from "@pod/ai";
import { createServicesFromEnv } from "../lib/services";

const { values } = parseArgs({
  options: {
    presets: { type: "string", default: PRESET_IDS.join(",") },
    "no-judge": { type: "boolean", default: false },
    only: { type: "string" },
    category: { type: "string" },
  },
});

const presets = values.presets!.split(",").map((p) => p.trim()) as PresetId[];
if (presets.some((p) => !PRESET_IDS.includes(p))) {
  console.error(`--presets must be from ${PRESET_IDS.join(",")}`);
  process.exit(1);
}
const judge = !values["no-judge"];
const services = createServicesFromEnv(SCRIPT_RETRY);

try {
  const runs = await getActiveRuns(services.sql);
  const gold = await loadGoldSet();
  const only = values.only?.split(",");
  const questions = gold.questions.filter((q) => (!only || only.includes(q.id)) && (!values.category || q.category === values.category));
  if (questions.length === 0) throw new Error("No questions to run — add them to eval/questions.json.");

  const results: QuestionResult[] = [];
  for (const preset of presets) {
    console.log(`\n${preset} · ${questions.length} questions${judge ? " · with judge" : " · retrieval only"}`);
    for (const q of questions) {
      const labelled = isLabelled(q);
      try {
        if (!judge) {
          const outcome = await runRetrieval(services, runs, q.question, preset);
          const r = scoreRetrieval(q, preset, outcome.final, outcome.sources, labelled);
          r.llmTokens = outcome.tokens.analysis + outcome.tokens.rerank;
          results.push(r);
          console.log(`  ${q.id.padEnd(8)} Hit@5 ${r.hit5 ?? "–"}  MRR ${r.mrr?.toFixed(2) ?? "–"}  ctx ${r.contextTokens}`);
          continue;
        }
        const answer = await answerOnce(services, runs, q.question, { preset, source: "eval" });
        // Every later question would fail the same way — stop instead of recording N errors.
        if (answer.errorCode === "quota") throw new Error(`Stopped at ${q.id}: ${answer.error}`);
        const outcome = answer.outcome;
        const r: QuestionResult = {
          ...scoreRetrieval(q, preset, outcome?.final ?? [], outcome?.sources ?? [], labelled),
          answer: answer.answer,
          refused: answer.refused,
          citations: answer.citations,
          invalidCitations: answer.invalidCitations,
          latencyMs: answer.latencyMs,
          firstTokenMs: answer.firstTokenMs,
          analysis: outcome?.analysis ?? undefined,
          llmTokens: (outcome?.tokens.analysis ?? 0) + (outcome?.tokens.rerank ?? 0),
          error: answer.error,
        };
        if (q.category !== "out_of_scope" && labelled && !answer.error && outcome) {
          r.citationHit = answer.citations.some((n) => {
            const s = outcome.sources[n - 1];
            return s ? overlaps(s.pageStart, s.pageEnd, q.expected_pages) : false;
          })
            ? 1
            : 0;
          const verdict = await judgeCorrectness(services.gemini, {
            documentName: DOCUMENT_NAME,
            question: q.question,
            expectedAnswer: q.expected_answer ?? "",
            mustInclude: q.must_include,
            mustNotInclude: q.must_not_include,
            answer: answer.answer,
            extraRules: JUDGE_EXTRA_RULES,
          });
          r.correctness = verdict.score;
          r.correctnessReason = verdict.reason;
          if (!answer.refused) {
            const faith = await judgeFaithfulness(services.gemini, { context: outcome.context, answer: answer.answer });
            r.faithful = faith.faithful;
            r.unsupportedClaims = faith.claims.filter((c) => !c.supported).map((c) => c.claim);
          }
        }
        results.push(r);
        console.log(`  ${q.id.padEnd(8)} Hit@5 ${r.hit5 ?? "–"}  correct ${r.correctness ?? "–"}  faithful ${r.faithful ?? "–"}${r.refused ? "  refused" : ""}`);
      } catch (error) {
        console.log(`  ${q.id.padEnd(8)} ERROR ${(error as Error).message}`);
        results.push({ ...scoreRetrieval(q, preset, [], [], labelled), error: (error as Error).message });
      }
    }
  }

  let commit = "unknown";
  try {
    commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {}
  const header = {
    Date: new Date().toISOString().slice(0, 16).replace("T", " "),
    Runs: Object.entries(runs).map(([kind, run]) => `${kind} ${run!.id.slice(0, 8)}`).join(" · ") || "none",
    Mode: judge ? `full · prompt ${ANSWER_PROMPT_VERSION} · judge ${JUDGE_PROMPT_VERSION}` : "retrieval only",
    Commit: commit,
  };
  const base = `eval/results/${timestampSlug()}-ablation${judge ? "" : "-retrieval"}`;
  await mkdir("eval/results", { recursive: true });
  await writeFile(`${base}.md`, renderAblation({ header, presets, results, judged: judge }));
  await writeFile(
    `${base}.json`,
    JSON.stringify({ header, summaries: Object.fromEntries(presets.map((p) => [p, summarise(results.filter((r) => r.preset === p))])), results }, null, 2),
  );
  console.log(`\nWrote ${base}.md and .json`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await services.sql.end();
}
