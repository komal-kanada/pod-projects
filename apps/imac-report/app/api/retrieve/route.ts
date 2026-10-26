import { GeminiError } from "@pod/ai";
import { DEFAULT_PRESET } from "@/lib/config";
import { askBodySchema, jsonError, modelErrorResponse, rateLimit, readJson } from "@/lib/http";
import { NotIngestedError, runRetrieval } from "@/lib/retrieval/pipeline";
import { getAppStatus, getServices } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { question, preset? } → analysis, chunk hits, elements, context — no generation. */
export async function POST(request: Request) {
  const limited = rateLimit(request, "retrieve");
  if (limited) return limited;
  const body = await readJson(request, askBodySchema);
  if ("error" in body) return body.error;
  const status = await getAppStatus();
  if (status.state !== "ready") return jsonError("No active ingestion runs.", 503);
  try {
    const outcome = await runRetrieval(getServices(), status.runs, body.data.question, body.data.preset ?? DEFAULT_PRESET);
    return Response.json({
      preset: outcome.preset,
      analysis: outcome.analysis,
      trace: outcome.trace,
      hits: outcome.hits.slice(0, 30).map(({ content, ...rest }) => ({ ...rest, preview: content.slice(0, 220) })),
      sources: outcome.sources,
      images: outcome.images,
    });
  } catch (error) {
    if (error instanceof NotIngestedError) return jsonError(error.message, 409);
    // Quota, rate limit, bad key: say so — the visitor can act on these.
    if (error instanceof GeminiError && error.kind !== "error") return modelErrorResponse(error);
    console.error("[imac] retrieve failed:", error);
    return jsonError("Retrieval failed. Try again in a moment.", 502);
  }
}
