import { listRuns } from "@/lib/db/runs";
import { jsonError } from "@/lib/http";
import { getAppStatus, getServices } from "@/lib/server";

export const runtime = "nodejs";

/** GET → every ingestion run and which one is active. */
export async function GET() {
  const status = await getAppStatus();
  if (status.state === "unconfigured" || status.state === "db-error") {
    return jsonError("Database not connected.", 503);
  }
  const runs = await listRuns(getServices().sql);
  return Response.json({ runs, activeRunId: runs.find((run) => run.isActive)?.id ?? null });
}
