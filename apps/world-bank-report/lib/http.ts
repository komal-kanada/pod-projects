import "server-only";

import { createRouteLimits } from "@pod/rag/http";
import { z } from "zod";
import { PRESET_IDS, type PresetId } from "./config";

export { jsonError, modelErrorResponse, readJson } from "@pod/rag/http";

export const askBodySchema = z.object({
  question: z.string().trim().min(3, "Ask a slightly longer question.").max(500, "Keep the question under 500 characters."),
  preset: z.enum(PRESET_IDS as [PresetId, ...PresetId[]]).optional(),
});

export const rateLimit = createRouteLimits();
