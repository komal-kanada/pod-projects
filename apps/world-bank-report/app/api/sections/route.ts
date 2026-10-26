import { listSections } from "@/lib/db/sections";
import { jsonError } from "@/lib/http";
import { getAppStatus, getServices } from "@/lib/server";

export const runtime = "nodejs";

/** GET → the hierarchical run's section tree (flat list with parent ids), summaries and chunk counts. */
export async function GET() {
  const status = await getAppStatus();
  if (status.state !== "ready" || !status.runs.hierarchical) return jsonError("No active hierarchical run.", 503);
  const sections = await listSections(getServices().sql, status.runs.hierarchical.id);
  return Response.json({ runId: status.runs.hierarchical.id, sections });
}
