/** `pnpm activate <runId|prefix>` — or with no argument, list runs. */
import { activateRun, listRuns, resolveRunId } from "../lib/db/runs";
import { createDbFromEnv } from "../lib/services";

const sql = createDbFromEnv();
try {
  const arg = process.argv[2];
  if (!arg) {
    const runs = await listRuns(sql);
    console.table(
      runs.map((run) => ({
        id: run.id.slice(0, 8),
        active: run.isActive ? "●" : "",
        status: run.status,
        chunks: run.chunkCount,
        config: JSON.stringify((run.config as { chunk?: unknown }).chunk ?? {}),
        created: run.createdAt.slice(0, 16),
      })),
    );
    console.log("Activate one with: pnpm activate <id>");
  } else {
    const run = await activateRun(sql, await resolveRunId(sql, arg));
    console.log(`Active run is now ${run.id.slice(0, 8)} (${run.chunkCount} chunks).`);
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
