/**
 * `pnpm ingest [pdf] [--chunk 3200] [--overlap 400] [--no-header] [--activate] [--force]`
 *
 * Builds a new ingestion run. Same file + same config = no-op unless --force.
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { DOCUMENT } from "../lib/config";
import { ingest } from "../lib/ingest/pipeline";
import { loadOutlineSupplement } from "../lib/ingest/supplement";
import { createServicesFromEnv } from "../lib/services";
import { chunkOptions } from "./options";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    chunk: { type: "string" },
    overlap: { type: "string" },
    "no-header": { type: "boolean", default: false },
    activate: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    notes: { type: "string" },
  },
});

const { sql, embedder } = createServicesFromEnv();
try {
  const data = new Uint8Array(await readFile(positionals[0] ?? DOCUMENT.path));
  const result = await ingest(
    { sql, embedder },
    { data, chunkConfig: chunkOptions(values), supplement: await loadOutlineSupplement(), activate: values.activate, force: values.force, notes: values.notes },
  );
  if (!values.activate && !result.skipped) {
    console.log(`\nActivate it with: pnpm activate ${result.runId.slice(0, 8)}`);
  }
} catch (error) {
  console.error(`\nIngestion failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
