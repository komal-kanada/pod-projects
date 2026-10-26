/** `pnpm publish-assets [--strategy X2]` — (re)writes page images and crops into public/report/. */
import { parseArgs } from "node:util";
import { CONFIG, DOCUMENT } from "../lib/config";
import { extractDocument } from "../lib/extract/run";
import { publishAssets } from "../lib/ingest/assets";
import { loadInputs, optionalGemini, strategyList } from "./shared";

const { values } = parseArgs({ options: { strategy: { type: "string" } } });
const [strategy] = strategyList(values.strategy, [CONFIG.extraction.chosen]);
const { data, pages } = await loadInputs();
const extraction = await extractDocument(strategy, { gemini: optionalGemini(), data, pages, cacheDir: DOCUMENT.cacheDir, log: () => {} });
await publishAssets(pages, extraction.elements);
console.log("Commit public/report/ so the deployed app can show them.");
