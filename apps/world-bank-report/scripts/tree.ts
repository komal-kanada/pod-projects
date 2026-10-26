/** `pnpm tree` — blocks + section tree from parsed.json → data/cache/tree.json, printed as an outline. */
import { writeFile } from "node:fs/promises";
import { DOCUMENT } from "../lib/config";
import { buildDocument } from "../lib/ingest/prepare";
import { loadParsed } from "../lib/parse/store";
import { loadOutline } from "../lib/structure/outline-file";
import { flattenTree, renderTree } from "../lib/structure/tree";

const parsed = await loadParsed();
const { tree, blocks } = buildDocument(parsed, "markdown", await loadOutline(parsed));
await writeFile(`${DOCUMENT.cacheDir}/tree.json`, JSON.stringify(tree, null, 2));

const counts: Record<string, number> = {};
for (const block of blocks) counts[block.kind] = (counts[block.kind] ?? 0) + 1;

console.log(renderTree(tree));
console.log(`\n${flattenTree(tree).length - 1} sections · blocks: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log("Check against the PDF's contents page: every chapter present, with the right start page.");
