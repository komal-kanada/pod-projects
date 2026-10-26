import { binaryPart, textPart } from "@pod/ai";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { EXTRACT_PROMPT_VERSION, pageElementsPrompt } from "../../prompts";
import type { Element, RenderedPage } from "../../types";
import { fromRaw } from "../from-raw";
import { pageElementsResponseSchema, rawElementSchema } from "../schema";
import type { Strategy, StrategyContext } from "./types";

/**
 * X1 — Gemini reads the page image (with the text layer as a hint for exact
 * characters) and returns every element with a box, via a response schema.
 */
export async function pageElements(page: RenderedPage, ctx: StrategyContext, prefix: string): Promise<Element[]> {
  if (!ctx.gemini) throw new Error(`${prefix} needs GEMINI_API_KEY.`);
  const png = await readFile(page.imagePath);
  const raw = await ctx.gemini.generateJson({
    model: ctx.model,
    prompt: [textPart(pageElementsPrompt(page.text)), binaryPart(png, "image/png")],
    schema: pageElementsResponseSchema,
    temperature: 0,
    maxOutputTokens: 16384,
    validate: (value) => z.array(rawElementSchema).parse(value),
    onUsage: (usage) => ctx.onUsage?.(usage.input + usage.output),
  });
  return raw
    .map((element, i) => fromRaw(element, { key: `${prefix}-p${String(page.page).padStart(2, "0")}-e${String(i).padStart(2, "0")}`, page: page.page, order: i }))
    .filter((element): element is Element => element !== null);
}

export const x1PageElements: Strategy = {
  id: "X1",
  version: (ctx) => `x1-${EXTRACT_PROMPT_VERSION}-${ctx.model}`,
  extractPage: (page, ctx) => pageElements(page, ctx, "X1"),
};
