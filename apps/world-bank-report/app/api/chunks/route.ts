import { RUN_KINDS, type RunKind } from "@/lib/config";
import { listChunks } from "@/lib/db/chunks";
import { jsonError } from "@/lib/http";
import { getAppStatus, getServices } from "@/lib/server";

export const runtime = "nodejs";

/** GET ?sectionId | ?page | ?type | ?q [&kind=hierarchical] → chunks with metadata. */
export async function GET(request: Request) {
  const status = await getAppStatus();
  if (status.state !== "ready") return jsonError("No active ingestion runs.", 503);

  const params = new URL(request.url).searchParams;
  const kind = (params.get("kind") ?? "hierarchical") as RunKind;
  if (!RUN_KINDS.includes(kind)) return jsonError("Unknown run kind.", 400);
  const run = status.runs[kind];
  if (!run) return jsonError(`No active ${kind} run.`, 404);

  const page = params.get("page") ? Number.parseInt(params.get("page")!, 10) : undefined;
  if (page !== undefined && (!Number.isFinite(page) || page < 1)) return jsonError("page must be a positive number.", 400);
  const sectionId = params.get("sectionId") ?? undefined;
  if (sectionId && !/^[0-9a-f-]{36}$/i.test(sectionId)) return jsonError("Invalid sectionId.", 400);

  const chunks = await listChunks(getServices().sql, run.id, {
    sectionId,
    page,
    type: params.get("type") ?? undefined,
    q: params.get("q")?.trim().slice(0, 200) || undefined,
    limit: Number.parseInt(params.get("limit") ?? "50", 10) || 50,
  });
  return Response.json({ runId: run.id, chunks });
}
