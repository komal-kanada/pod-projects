import { PRESETS, DEFAULT_PRESET } from "@/lib/config";
import { listRuns } from "@/lib/db/runs";
import { jsonError } from "@/lib/http";
import { getAppStatus, getServices } from "@/lib/server";

export const runtime = "nodejs";

/** GET → runs, the active run per kind, and the presets. */
export async function GET() {
  const status = await getAppStatus();
  if (status.state === "unconfigured" || status.state === "db-error") return jsonError("Database not connected.", 503);
  const runs = await listRuns(getServices().sql);
  return Response.json({
    runs,
    active: Object.fromEntries(runs.filter((r) => r.isActive).map((r) => [r.kind, r.id])),
    presets: PRESETS,
    defaultPreset: DEFAULT_PRESET,
  });
}
