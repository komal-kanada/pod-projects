/** `pnpm activate <runId|prefix>` — or with no argument, list runs. */
import { activateRun, listRuns, resolveRunId } from "../lib/db/runs";
import { createDbFromEnv } from "../lib/services";

const sql = createDbFromEnv();
try {
  const arg = process.argv[2];
  if (!arg) {
    console.table(
      (await listRuns(sql)).map((run) => ({
        id: run.id.slice(0, 8),
        kind: run.kind,
        active: run.isActive ? "●" : "",
        status: run.status,
        chunks: (run.stats as { chunks?: number } | null)?.chunks ?? null,
        created: run.createdAt.slice(0, 16),
      })),
    );
  } else {
    const run = await activateRun(sql, await resolveRunId(sql, arg));
    console.log(`Active ${run.kind} run is now ${run.id.slice(0, 8)}.`);
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
