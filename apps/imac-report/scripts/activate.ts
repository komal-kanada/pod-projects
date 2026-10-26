/** `pnpm activate <runId|prefix>` — or with no argument, list runs. */
import { activateRun, listRuns, resolveRunId } from "../lib/db/runs";
import { createDbFromEnv } from "../lib/services";

const sql = createDbFromEnv();
try {
  const arg = process.argv[2];
  if (!arg) {
    console.table((await listRuns(sql)).map((r) => ({ id: r.id.slice(0, 8), run: `${r.strategy}:${r.representation}`, active: r.isActive ? "●" : "", status: r.status, chunks: (r.stats as { chunks?: number } | null)?.chunks ?? null, created: r.createdAt.slice(0, 16) })));
  } else {
    const run = await activateRun(sql, await resolveRunId(sql, arg));
    console.log(`Active ${run.strategy}:${run.representation} run is now ${run.id.slice(0, 8)}.`);
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
