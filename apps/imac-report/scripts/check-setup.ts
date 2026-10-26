/** `pnpm check:setup` — env, Gemini, database + isolation, migrations, inputs. Non-zero exit on failure. */
import { access } from "node:fs/promises";
import { checkGemini } from "@pod/ai/check";
import { createDb } from "@pod/db";
import { checkDatabase } from "@pod/db/check";
import { readEnv } from "@pod/rag/app-env";
import { CONFIG, DOCUMENT, SCHEMA } from "../lib/config";
import { getActiveRuns } from "../lib/db/runs";
import { isLabelled, loadGoldSet } from "../lib/eval/qa/questions";
import { loadGroundTruth } from "../lib/eval/extraction/ground-truth";

let failed = 0;
const print = (lines: string[]) => lines.forEach((line) => console.log(`  ${line}`));
const env = readEnv();

console.log("\nEnvironment");
for (const [name, value] of [["DATABASE_URL", env.databaseUrl], ["GEMINI_API_KEY", env.geminiApiKey]] as const) {
  if (value) print([`ok    ${name}`]);
  else {
    failed += 1;
    print([`FAIL  ${name} is not set → copy .env.example to .env.local`]);
  }
}

if (env.geminiApiKey) {
  console.log("\nGemini");
  const result = await checkGemini(env.geminiApiKey);
  print(result.lines);
  if (!result.ok) failed += 1;
}

if (env.databaseUrl) {
  console.log("\nDatabase");
  const result = await checkDatabase(env.databaseUrl, { schema: SCHEMA, tables: ["documents", "ingestion_runs", "pages", "elements", "footnote_links", "chunks", "queries"] });
  print(result.lines);
  if (!result.ok) failed += 1;
  if (result.migrated) {
    const sql = createDb(env.databaseUrl, { max: 1 });
    const runs = await getActiveRuns(sql);
    await sql.end();
    for (const key of ["X0:flat", "X1:flat", `${CONFIG.extraction.chosen}:typed`] as const) {
      const run = runs[key as keyof typeof runs];
      print([run ? `ok    active ${key} run ${run.id.slice(0, 8)}` : `warn  no active ${key} run → pnpm ingest --activate`]);
    }
  }
}

console.log("\nInputs");
try {
  await access(DOCUMENT.path);
  print([`ok    ${DOCUMENT.path}`]);
} catch {
  failed += 1;
  print([`FAIL  ${DOCUMENT.path} not found`]);
}
try {
  const gold = await loadGoldSet();
  const provided = gold.questions.filter((q) => q.source === "provided").length;
  print([provided ? `ok    gold set: ${gold.questions.length} questions (${provided} provided, ${gold.questions.filter(isLabelled).length} labelled)` : "warn  no provided sample questions yet → eval/questions.json"]);
} catch (error) {
  failed += 1;
  print([`FAIL  eval/questions.json: ${(error as Error).message}`]);
}

try {
  const gt = await loadGroundTruth();
  const n = gt.tables.length + gt.charts.length + gt.footnotes.length + gt.coverage.length;
  print([n ? `ok    ground truth: ${gt.tables.length} tables, ${gt.charts.length} charts, ${gt.footnotes.length} footnotes, ${gt.coverage.length} pages of facts` : "warn  eval/ground-truth/ is empty → label it before pnpm extract:eval"]);
} catch (error) {
  failed += 1;
  print([`FAIL  ${(error as Error).message}`]);
}

console.log(failed ? `\n${failed} problem(s).\n` : "\nAll good.\n");
process.exit(failed ? 1 : 0);
