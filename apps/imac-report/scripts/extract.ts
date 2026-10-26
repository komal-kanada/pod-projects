/** `pnpm extract --strategy X0,X1,X2 [--pages 3-5] [--force]` — elements per page, cached per strategy. */
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { DOCUMENT } from "../lib/config";
import { extractDocument } from "../lib/extract/run";
import { loadInputs, optionalGemini, pageList, strategyList } from "./shared";

const { values } = parseArgs({ options: { strategy: { type: "string" }, pages: { type: "string" }, force: { type: "boolean", default: false } } });
const strategies = strategyList(values.strategy, ["X0", "X1", "X2"]);
const { data, pages } = await loadInputs();
const gemini = optionalGemini();

for (const strategy of strategies) {
  if (strategy !== "X0" && !gemini) {
    console.log(`Skipping ${strategy}: needs GEMINI_API_KEY.`);
    continue;
  }
  console.log(`\n${strategy}`);
  const result = await extractDocument(strategy, { gemini, data, pages, cacheDir: DOCUMENT.cacheDir, only: pageList(values.pages), force: values.force, applyOverrides: false });
  const byType: Record<string, number> = {};
  for (const e of result.elements) byType[e.type] = (byType[e.type] ?? 0) + 1;
  console.log(`  ${result.elements.length} elements · ${Object.entries(byType).map(([t, n]) => `${t} ${n}`).join(", ")}`);
  console.log(`  ${result.links.length} footnote links · ${result.unresolved.length} unresolved markers · ${result.elements.filter((e) => e.fidelity?.flags.length).length} fidelity flags`);
  await writeFile(`${DOCUMENT.cacheDir}/extract/${strategy}/summary.json`, JSON.stringify({ links: result.links, unresolved: result.unresolved, perPage: result.perPage }, null, 2));
}
