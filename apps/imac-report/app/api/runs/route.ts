import { CONFIG, DEFAULT_PRESET, PRESETS, STRATEGIES } from "@/lib/config";
import { listRuns } from "@/lib/db/runs";
import { jsonError } from "@/lib/http";
import { getAppStatus, getServices } from "@/lib/server";

export const runtime = "nodejs";

/** GET → runs per (strategy, representation), the chosen strategy, presets. */
export async function GET() {
  const status = await getAppStatus();
  if (status.state === "unconfigured" || status.state === "db-error") return jsonError("Database not connected.", 503);
  const runs = await listRuns(getServices().sql);
  return Response.json({ runs, chosenStrategy: CONFIG.extraction.chosen, strategies: STRATEGIES, presets: PRESETS, defaultPreset: DEFAULT_PRESET });
}
