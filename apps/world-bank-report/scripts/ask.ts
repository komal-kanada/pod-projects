/** `pnpm ask "question" [--preset B5] [--trace]` — answer in the terminal. */
import { parseArgs } from "node:util";
import { DEFAULT_PRESET, PRESET_IDS, type PresetId } from "../lib/config";
import { getActiveRuns } from "../lib/db/runs";
import { answerStream } from "../lib/rag/answer";
import { SCRIPT_RETRY } from "@pod/ai";
import { createServicesFromEnv } from "../lib/services";
import { PATH_SEPARATOR } from "../lib/types";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { preset: { type: "string", default: DEFAULT_PRESET }, trace: { type: "boolean", default: false } },
});
const question = positionals.join(" ").trim();
const preset = values.preset as PresetId;
if (!question || !PRESET_IDS.includes(preset)) {
  console.error(`Usage: pnpm ask "question" [--preset ${PRESET_IDS.join("|")}] [--trace]`);
  process.exit(1);
}

const services = createServicesFromEnv(SCRIPT_RETRY);
try {
  const runs = await getActiveRuns(services.sql);
  for await (const event of answerStream(services, runs, question, { preset, source: "cli" })) {
    if (event.type === "analysis") {
      console.log(`\nUnderstood as: ${event.analysis.intent} · "${event.analysis.rewrittenQuery}" · filters ${JSON.stringify(event.analysis.filters)}`);
    } else if (event.type === "sources") {
      console.log(`\nSources (${preset}):`);
      for (const s of event.sources) console.log(`  [${s.n}] ${s.pageLabel.padEnd(11)} ${s.contentType.padEnd(6)} ${s.tokens.toString().padStart(5)} tok  ${s.sectionPath.join(PATH_SEPARATOR) || "—"}`);
      console.log("\nAnswer:");
    } else if (event.type === "token") {
      process.stdout.write(event.text);
    } else if (event.type === "trace" && values.trace) {
      console.log("\n\nTrace:");
      for (const stage of event.trace) console.log(`  ${stage.stage.padEnd(9)} ${String(stage.ms).padStart(6)} ms  ${stage.summary}`);
    } else if (event.type === "done") {
      console.log(`\n\n${Math.round(event.latencyMs)} ms · ${event.contextTokens} ctx tokens · cited ${event.citations.join(", ") || "none"}${event.invalidCitations.length ? ` · INVALID ${event.invalidCitations.join(", ")}` : ""}${event.refused ? " · refused" : ""}`);
    } else if (event.type === "error") {
      console.error(`\nError: ${event.message}`);
      process.exitCode = 1;
    }
  }
} finally {
  await services.sql.end();
}
