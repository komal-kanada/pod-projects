import { listChunks } from "@/lib/db/chunks";
import { jsonError } from "@/lib/http";
import { getAppStatus, getServices } from "@/lib/server";

export const runtime = "nodejs";

/** GET ?page=14 | ?q=text [&limit=50] → chunks of the active run, in reading order. */
export async function GET(request: Request) {
  const status = await getAppStatus();
  if (status.state !== "ready") return jsonError("No active ingestion run.", 503);

  const params = new URL(request.url).searchParams;
  const page = params.get("page");
  const q = params.get("q")?.trim().slice(0, 200) || undefined;
  const limit = Number.parseInt(params.get("limit") ?? "50", 10);
  const pageNumber = page === null ? undefined : Number.parseInt(page, 10);
  if (pageNumber !== undefined && (!Number.isFinite(pageNumber) || pageNumber < 1)) {
    return jsonError("page must be a positive number.", 400);
  }

  const chunks = await listChunks(getServices().sql, status.run.id, {
    page: pageNumber,
    q,
    limit: Number.isFinite(limit) ? limit : 50,
  });
  return Response.json({ runId: status.run.id, chunks });
}
