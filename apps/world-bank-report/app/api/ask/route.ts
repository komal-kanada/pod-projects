import { describeGeminiError } from "@pod/ai";
import { ndjsonResponse } from "@pod/rag/ndjson";
import { DEFAULT_PRESET } from "@/lib/config";
import { askBodySchema, jsonError, rateLimit, readJson } from "@/lib/http";
import { answerStream } from "@/lib/rag/answer";
import { getAppStatus, getServices } from "@/lib/server";
import type { AskEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { question, preset? } → NDJSON: analysis, sources, trace, token…, done | error. */
export async function POST(request: Request) {
  const limited = rateLimit(request, "ask");
  if (limited) return limited;
  const body = await readJson(request, askBodySchema);
  if ("error" in body) return body.error;

  const status = await getAppStatus();
  if (status.state !== "ready") {
    return jsonError(status.state === "not-ingested" ? "The report hasn't been ingested yet." : "This app isn't connected to its database and model yet.", 503);
  }
  const runs = status.runs;
  const { question, preset = DEFAULT_PRESET } = body.data;

  async function* events(): AsyncGenerator<AskEvent> {
    for await (const event of answerStream(getServices(), runs, question, { preset, signal: request.signal })) {
      if (event.type === "sources") yield { type: "sources", preset: event.preset, sources: event.sources };
      else yield event;
    }
  }

  return ndjsonResponse(events(), {
    onError: (cause) => {
      const failure = describeGeminiError(cause);
      return failure.kind === "error"
        ? { type: "error" as const, message: "Something went wrong while answering. Try again.", retryable: true }
        : { type: "error" as const, message: failure.message, retryable: failure.retryable, code: failure.kind };
    },
  });
}
