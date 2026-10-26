/**
 * `pnpm ingest [--strategy X2] [--representation typed|flat] [--activate] [--force] [--no-publish]`
 * With no options: builds the three runs the presets need — X0:flat (M0),
 * X1:flat (M1) and <chosen>:typed (M2–M4).
 */
import { parseArgs } from "node:util";
import { CONFIG, DOCUMENT, type Representation, type StrategyId } from "../lib/config";
import { extractDocument } from "../lib/extract/run";
import { ingest } from "../lib/ingest/pipeline";
import { createServicesFromEnv } from "../lib/services";
import { loadInputs, SCRIPT_RETRY, strategyList } from "./shared";

const { values } = parseArgs({
  options: {
    strategy: { type: "string" },
    representation: { type: "string" },
    activate: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    "no-publish": { type: "boolean", default: false },
  },
});

const plan: [StrategyId, Representation][] = values.strategy
  ? [[strategyList(values.strategy, [])[0], (values.representation ?? "typed") as Representation]]
  : [["X0", "flat"], ["X1", "flat"], [CONFIG.extraction.chosen, "typed"]];

const services = createServicesFromEnv(SCRIPT_RETRY);
try {
  const { data, pages, documentSha } = await loadInputs();
  for (const [strategy, representation] of plan) {
    const extraction = await extractDocument(strategy, { gemini: services.gemini, data, pages, cacheDir: DOCUMENT.cacheDir });
    const result = await ingest(services, {
      representation,
      extraction,
      pages,
      documentSha,
      activate: values.activate,
      force: values.force,
      // Assets come from the typed run — that's what the Explorer and source cards show.
      publish: !values["no-publish"] && representation === "typed",
    });
    if ("stats" in result && result.stats) console.table({ ...result.stats.byKind });
  }
} catch (error) {
  console.error(`\nIngestion failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await services.sql.end();
}
