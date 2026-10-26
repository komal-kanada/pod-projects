/** `pnpm ask "question" [--k 6] [--mode vector|hybrid]` — answer in the terminal. */
import { parseArgs } from "node:util";
import { RAG_CONFIG, type RetrievalMode } from "../lib/config";
import { getActiveRun } from "../lib/db/runs";
import { answerStream } from "../lib/rag/answer";
import { createServicesFromEnv } from "../lib/services";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { k: { type: "string" }, mode: { type: "string" } },
});
const question = positionals.join(" ").trim();
if (!question) {
  console.error('Usage: pnpm ask "What was …?" [--k 6] [--mode hybrid]');
  process.exit(1);
}

const services = createServicesFromEnv();
try {
  const run = await getActiveRun(services.sql);
  if (!run) throw new Error("No active ingestion run. Run pnpm ingest --activate first.");

  const mode = (values.mode ?? RAG_CONFIG.retrieval.mode) as RetrievalMode;
  const topK = values.k ? Number.parseInt(values.k, 10) : RAG_CONFIG.retrieval.topK;

  for await (const event of answerStream(services, run, question, { mode, topK, source: "cli" })) {
    if (event.type === "sources") {
      console.log(`\nSources (${mode}, run ${run.id.slice(0, 8)}):`);
      for (const s of event.sources) {
        console.log(`  [${s.n}] ${s.pageLabel.padEnd(10)} ${s.similarity.toFixed(3)}  ${s.section ?? "—"}`);
      }
      console.log("\nAnswer:");
    } else if (event.type === "token") {
      process.stdout.write(event.text);
    } else if (event.type === "done") {
      console.log(
        `\n\n${Math.round(event.latencyMs)} ms · cited ${event.citations.join(", ") || "none"}${event.invalidCitations.length ? ` · INVALID ${event.invalidCitations.join(", ")}` : ""}${event.refused ? " · refused" : ""}`,
      );
    } else if (event.type === "error") {
      console.error(`\nError: ${event.message}`);
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await services.sql.end();
}
