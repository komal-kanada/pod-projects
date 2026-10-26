import { elementDetail } from "@/lib/db/read";
import { jsonError } from "@/lib/http";
import { getAppStatus, getServices } from "@/lib/server";

export const runtime = "nodejs";

/** GET → one element with its derived chunks, footnote links (both ways) and fidelity. */
export async function GET(_request: Request, { params }: RouteContext<"/api/elements/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Invalid element id.", 400);
  const status = await getAppStatus();
  if (status.state !== "ready") return jsonError("No active ingestion runs.", 503);
  const detail = await elementDetail(getServices().sql, id);
  if (!detail) return jsonError("Element not found.", 404);
  return Response.json(detail);
}
