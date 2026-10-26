/** `pnpm ask "question" [--preset M4] [--trace]` — answer in the terminal. */
import { parseArgs } from "node:util";
import { DEFAULT_PRESET, PRESET_IDS, type PresetId } from "../lib/config";
import { getActiveRuns } from "../lib/db/runs";
import { answerStream } from "../lib/rag/answer";
import { createServicesFromEnv } from "../lib/services";
import { SCRIPT_RETRY } from "./shared";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { preset: { type: "string", default: DEFAULT_PRESET }, trace: { type: "boolean", default: false } } });
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
    if (event.type === "analysis") console.log(`\nLooking in: ${event.analysis.intent} · ${event.analysis.targetTypes.join(", ") || "any type"}${event.analysis.variants.length ? ` · ${event.analysis.variants.join(", ")}` : ""}`);
    else if (event.type === "sources") {
      console.log(`\nSources (${preset}):`);
      for (const s of event.sources) console.log(`  [${s.n}] ${s.type.padEnd(8)} p.${String(s.page).padEnd(3)} ${s.title ?? s.section ?? ""}${s.imageAttached ? "  [image]" : ""}${s.footnotes.length ? `  +${s.footnotes.length} note(s)` : ""}`);
      console.log("\nAnswer:");
    } else if (event.type === "token") process.stdout.write(event.text);
    else if (event.type === "trace" && values.trace) {
      console.log("\n\nTrace:");
      for (const stage of event.trace) console.log(`  ${stage.stage.padEnd(9)} ${String(stage.ms).padStart(6)} ms  ${stage.summary}`);
    } else if (event.type === "done") {
      console.log(`\n\n${Math.round(event.latencyMs)} ms · ${event.images} image(s) · cited ${event.citations.join(", ") || "none"}${event.disagreements.length ? ` · image/extraction disagreement on ${event.disagreements.join(", ")}` : ""}${event.refused ? " · refused" : ""}`);
    } else if (event.type === "error") {
      console.error(`\nError: ${event.message}`);
      process.exitCode = 1;
    }
  }
} finally {
  await services.sql.end();
}
