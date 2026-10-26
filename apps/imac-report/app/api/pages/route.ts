import { STRATEGY_IDS, type StrategyId } from "@/lib/config";
import { listPages } from "@/lib/db/read";
import { jsonError } from "@/lib/http";
import { getAppStatus, getServices } from "@/lib/server";
import type { RunKey } from "@/lib/types";

export const runtime = "nodejs";

/** GET ?strategy=X2 → pages (image, size) with every element (type, box, title, flags). */
export async function GET(request: Request) {
  const status = await getAppStatus();
  if (status.state !== "ready") return jsonError("No active ingestion runs.", 503);
  const strategy = (new URL(request.url).searchParams.get("strategy") ?? "") as StrategyId;
  if (!STRATEGY_IDS.includes(strategy)) return jsonError("Unknown strategy.", 400);
  const run = status.runs[`${strategy}:typed` as RunKey] ?? status.runs[`${strategy}:flat` as RunKey];
  if (!run) return jsonError(`No active run for ${strategy}.`, 404);
  return Response.json({ runId: run.id, strategy, pages: await listPages(getServices().sql, run.id) });
}
