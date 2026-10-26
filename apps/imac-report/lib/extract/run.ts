import { readFile } from "node:fs/promises";
import type { Gemini } from "@pod/ai";
import { mapWithConcurrency } from "@pod/rag/concurrency";
import { createDiskCache } from "@pod/rag/disk-cache";
import { CONFIG, type StrategyId } from "../config";
import { x3Model } from "../env";
import type { Element, FootnoteLink, RenderedPage } from "../types";
import { checkFidelity } from "./fidelity";
import { linkFootnotes } from "./footnotes";
import { x0TextLayer } from "./strategies/x0-text-layer";
import { x1PageElements } from "./strategies/x1-page-elements";
import { focusedPass, x2Focused, x3Stronger } from "./strategies/x2-focused";
import type { Strategy, StrategyContext } from "./strategies/types";
import { mergeMultiPageTables } from "./tables";

/**
 * Runs a strategy over every page — cached per page by (image hash,
 * strategy version), so re-runs are free and a crash resumes — then the
 * document-level steps that need all pages: sections, multi-page tables,
 * fidelity, footnote links and manual overrides.
 */
export const STRATEGY_IMPLS: Record<StrategyId, Strategy> = { X0: x0TextLayer, X1: x1PageElements, X2: x2Focused, X3: x3Stronger };

export interface ExtractionResult {
  strategy: StrategyId;
  elements: Element[];
  links: FootnoteLink[];
  unresolved: { elementKey: string; marker: string }[];
  perPage: { page: number; ms: number; tokens: number; cached: boolean }[];
  overridesApplied: string[];
}

export function modelFor(strategy: StrategyId): string {
  if (strategy === "X3") {
    const model = x3Model();
    if (!model) throw new Error("X3 needs X3_MODEL in .env.local (a stronger Gemini model id).");
    return model;
  }
  return CONFIG.extraction.model;
}

export async function extractDocument(
  strategy: StrategyId,
  {
    gemini,
    data,
    pages,
    cacheDir,
    only,
    force = false,
    applyOverrides = true,
    log = console.log,
  }: {
    gemini: Gemini | null;
    data: Uint8Array;
    pages: RenderedPage[];
    cacheDir: string;
    only?: number[];
    force?: boolean;
    applyOverrides?: boolean;
    log?: (line: string) => void;
  },
): Promise<ExtractionResult> {
  const impl = STRATEGY_IMPLS[strategy];
  const model = strategy === "X0" ? "none" : modelFor(strategy);
  const cache = createDiskCache(`${cacheDir}/extract/${strategy}`);
  const x1Cache = createDiskCache(`${cacheDir}/extract/X1`);
  const perPage: ExtractionResult["perPage"] = [];

  const pageElements = await mapWithConcurrency(pages, strategy === "X0" ? 8 : CONFIG.extraction.concurrency, async (page) => {
    let tokens = 0;
    const ctx: StrategyContext = { gemini, data, pages, model, onUsage: (t) => (tokens += t) };
    const key = `page-${String(page.page).padStart(2, "0")}-${page.imageHash}-${impl.version(ctx)}`;
    const wanted = !only || only.includes(page.page);
    const cached = force && wanted ? null : await cache.get<{ elements: Element[]; ms: number; tokens: number }>(key);
    if (cached) {
      perPage.push({ page: page.page, ms: cached.ms, tokens: cached.tokens, cached: true });
      return cached.elements;
    }
    if (!wanted) return [];

    const started = performance.now();
    let elements: Element[];
    // X2 = X1 + focused pass: reuse X1's cached page when there is one.
    const x1 = strategy === "X2" ? await x1Cache.get<{ elements: Element[] }>(`page-${String(page.page).padStart(2, "0")}-${page.imageHash}-${x1PageElements.version(ctx)}`) : null;
    if (x1) {
      const rekeyed = x1.elements.map((e) => ({ ...e, key: e.key.replace(/^X1-/, "X2-") }));
      elements = await focusedPass(rekeyed, page, ctx, "X2");
    } else {
      elements = await impl.extractPage(page, ctx);
    }
    const ms = Math.round(performance.now() - started);
    await cache.set(key, { elements, ms, tokens });
    perPage.push({ page: page.page, ms, tokens, cached: false });
    log(`  ${strategy} page ${page.page}: ${elements.length} elements (${ms} ms)`);
    return elements;
  });

  const pageByNumber = new Map(pages.map((p) => [p.page, p]));
  let elements = mergeMultiPageTables(pageElements.flat());

  // Sections: the latest heading above each element, in reading order.
  let section: string | undefined;
  elements = elements.map((element) => {
    if (element.type === "heading" && element.level <= 2) section = element.text.replace(/\^\S+/g, "").trim();
    return { ...element, section };
  });

  elements = elements.map((element) => {
    const page = pageByNumber.get(element.page);
    return page ? checkFidelity(element, page) : element;
  });

  const overridesApplied: string[] = [];
  if (applyOverrides) {
    const overrides = await loadOverrides();
    elements = elements.map((element) => {
      const patch = overrides[element.key];
      if (!patch) return element;
      overridesApplied.push(element.key);
      return { ...element, ...patch, overridden: true } as Element;
    });
  }

  const { links, unresolved } = linkFootnotes(elements, pages);
  return { strategy, elements, links, unresolved, perPage: perPage.sort((a, b) => a.page - b.page), overridesApplied };
}

/** data/overrides.json: { "<elementKey>": { …fields to replace } } (04 §6). */
export async function loadOverrides(): Promise<Record<string, Partial<Element>>> {
  try {
    return JSON.parse(await readFile("data/overrides.json", "utf8"));
  } catch {
    return {};
  }
}
