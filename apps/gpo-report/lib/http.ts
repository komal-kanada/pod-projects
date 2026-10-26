import "server-only";

import { createRouteLimits } from "@pod/rag/http";
import { z } from "zod";
import { RAG_CONFIG } from "./config";

export { jsonError, modelErrorResponse, readJson } from "@pod/rag/http";

export const askBodySchema = z.object({
  question: z.string().trim().min(3, "Ask a slightly longer question.").max(500, "Keep the question under 500 characters."),
  topK: z.number().int().min(1).max(RAG_CONFIG.retrieval.maxTopK).optional(),
  mode: z.enum(["vector", "hybrid"]).optional(),
});

export const rateLimit = createRouteLimits();
