/**
 * `pnpm ingest --kind flat:text|flat:markdown|hierarchical|all [--summaries] [--activate] [--force]`
 *
 * Builds runs from data/cache/parsed.json (run `pnpm parse` first).
 */
import { parseArgs } from "node:util";
import { RUN_KINDS, type RunKind } from "../lib/config";
import { ingest } from "../lib/ingest/pipeline";
import { loadParsed } from "../lib/parse/store";
import { loadOutline } from "../lib/structure/outline-file";
import { SCRIPT_RETRY } from "@pod/ai";
import { createServicesFromEnv } from "../lib/services";

const { values } = parseArgs({
  options: {
    kind: { type: "string", default: "all" },
    summaries: { type: "boolean", default: false },
    activate: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  },
});

const kinds: RunKind[] = values.kind === "all" ? [...RUN_KINDS] : [values.kind as RunKind];
if (kinds.some((kind) => !RUN_KINDS.includes(kind))) {
  console.error(`--kind must be one of: ${RUN_KINDS.join(", ")}, all`);
  process.exit(1);
}

const services = createServicesFromEnv(SCRIPT_RETRY);
try {
  const parsed = await loadParsed();
  const outline = await loadOutline(parsed);
  for (const kind of kinds) {
    if (kind !== "flat:text" && parsed.markdownPages.every((page) => page === null)) {
      console.log(`Skipping ${kind}: no Gemini markdown yet (run pnpm parse without --text-only).`);
      continue;
    }
    const result = await ingest(services, { kind, parsed, outline, summaries: values.summaries, activate: values.activate, force: values.force });
    if ("stats" in result && result.stats) console.table(result.stats.byType);
  }
} catch (error) {
  console.error(`\nIngestion failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await services.sql.end();
}
