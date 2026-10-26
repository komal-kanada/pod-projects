import { GeminiError } from "@pod/ai";
import { askBodySchema, jsonError, modelErrorResponse, rateLimit, readJson } from "@/lib/http";
import { retrieve } from "@/lib/retrieval/retrieve";
import { getAppStatus, getServices } from "@/lib/server";

export const runtime = "nodejs";

/** POST { question, topK?, mode? } → ranked chunks, no generation (Inspect). */
export async function POST(request: Request) {
  const limited = rateLimit(request, "retrieve");
  if (limited) return limited;

  const body = await readJson(request, askBodySchema);
  if ("error" in body) return body.error;

  const status = await getAppStatus();
  if (status.state !== "ready") return jsonError("No active ingestion run.", 503);

  try {
    const result = await retrieve(getServices(), status.run, body.data.question, body.data);
    return Response.json({
      ...result,
      embeddingMs: Math.round(result.embeddingMs),
      searchMs: Math.round(result.searchMs),
    });
  } catch (error) {
    // Quota, rate limit, bad key: say so — the visitor can act on these.
    if (error instanceof GeminiError && error.kind !== "error") return modelErrorResponse(error);
    console.error("[gpo] retrieve failed:", error);
    return jsonError("Retrieval failed. Try again in a moment.", 502);
  }
}
