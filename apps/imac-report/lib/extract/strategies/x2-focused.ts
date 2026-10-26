import { binaryPart, textPart } from "@pod/ai";
import { CONFIG } from "../../config";
import { focusedChartPrompt, focusedTablePrompt, EXTRACT_PROMPT_VERSION } from "../../prompts";
import { cropPng } from "../../render/crop";
import { renderPageAt } from "../../render/pages";
import { textInside } from "../../render/text-layer";
import type { Element, RenderedPage } from "../../types";
import { checkFidelity } from "../fidelity";
import { fromRaw } from "../from-raw";
import { rawElementSchema, singleElementResponseSchema } from "../schema";
import { pageElements } from "./x1-page-elements";
import type { Strategy, StrategyContext } from "./types";

/**
 * X2 — X1, then a focused second pass on every table and chart: the region
 * is re-rendered at 300 DPI and extracted on its own, where small labels are
 * legible. The focused result replaces X1's only if it parses and is at
 * least as faithful to the text layer; otherwise X1's stays (04 §3).
 */
function precision(element: Element, page: RenderedPage): number {
  return checkFidelity(element, page).fidelity?.numericPrecision ?? 1;
}

export async function focusedPass(elements: Element[], page: RenderedPage, ctx: StrategyContext, prefix: string): Promise<Element[]> {
  if (!ctx.gemini) throw new Error(`${prefix} needs GEMINI_API_KEY.`);
  const targets = elements.filter((e) => (e.type === "table" || e.type === "chart") && e.bbox);
  if (targets.length === 0) return elements;

  const hiRes = renderPageAt(ctx.data, page.page, CONFIG.extraction.focusDpi);
  const out = [...elements];
  for (const target of targets) {
    try {
      const crop = await cropPng(hiRes, target.bbox!, { padding: CONFIG.extraction.cropPadding });
      const hint = textInside(page.lines, target.bbox!);
      const raw = await ctx.gemini.generateJson({
        model: ctx.model,
        prompt: [textPart(target.type === "table" ? focusedTablePrompt(hint) : focusedChartPrompt(hint)), binaryPart(crop, "image/png")],
        schema: singleElementResponseSchema,
        temperature: 0,
        maxOutputTokens: 8192,
        validate: (value) => rawElementSchema.omit({ type: true }).parse(value),
        onUsage: (usage) => ctx.onUsage?.(usage.input + usage.output),
      });
      const focused = fromRaw({ ...raw, type: target.type, box_2d: target.bbox! }, { key: target.key, page: target.page, order: target.order });
      if (focused && precision(focused, page) >= precision(target, page)) {
        out[out.indexOf(target)] = { ...focused, footnoteRefs: [...new Set([...target.footnoteRefs, ...focused.footnoteRefs])] };
      }
    } catch {
      // Keep X1's version; the run report counts elements without a focused pass.
    }
  }
  return out;
}

export const x2Focused: Strategy = {
  id: "X2",
  version: (ctx) => `x2-${EXTRACT_PROMPT_VERSION}-${ctx.model}`,
  async extractPage(page, ctx) {
    const base = await pageElements(page, ctx, "X2");
    return focusedPass(base, page, ctx, "X2");
  },
};

/** X3 — the same as X2, run with a stronger model (X3_MODEL). */
export const x3Stronger: Strategy = {
  id: "X3",
  version: (ctx) => `x3-${EXTRACT_PROMPT_VERSION}-${ctx.model}`,
  async extractPage(page, ctx) {
    const base = await pageElements(page, ctx, "X3");
    return focusedPass(base, page, ctx, "X3");
  },
};
