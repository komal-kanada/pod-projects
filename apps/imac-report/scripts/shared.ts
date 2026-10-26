import { readFile } from "node:fs/promises";
import { createGemini, FALLBACK_MODELS, SCRIPT_RETRY, type Gemini } from "@pod/ai";
import { readEnv } from "@pod/rag/app-env";
import { sha256 } from "@pod/rag/hash";
import { DOCUMENT, STRATEGY_IDS, type StrategyId } from "../lib/config";
import { loadRenderedPages } from "../lib/render/pages";

/** Bits every iMac script needs: the PDF, rendered pages, an optional Gemini. */
export async function loadInputs() {
  const data = new Uint8Array(await readFile(DOCUMENT.path));
  const pages = await loadRenderedPages(DOCUMENT.cacheDir);
  return { data, pages, documentSha: sha256(data) };
}

export { SCRIPT_RETRY };

export function optionalGemini(): Gemini | null {
  const { geminiApiKey } = readEnv();
  return geminiApiKey ? createGemini({ apiKey: geminiApiKey, retry: SCRIPT_RETRY, fallbackModels: FALLBACK_MODELS }) : null;
}

export function strategyList(value: string | undefined, fallback: StrategyId[]): StrategyId[] {
  const list = (value?.split(",").map((s) => s.trim().toUpperCase()) ?? fallback) as StrategyId[];
  const bad = list.filter((s) => !STRATEGY_IDS.includes(s));
  if (bad.length) throw new Error(`Unknown strategy: ${bad.join(", ")} (use ${STRATEGY_IDS.join(", ")})`);
  return list;
}

export function pageList(spec: string | undefined): number[] | undefined {
  if (!spec) return undefined;
  return spec.split(",").flatMap((part) => {
    const [a, b] = part.split("-").map((n) => Number.parseInt(n, 10));
    return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a];
  });
}
