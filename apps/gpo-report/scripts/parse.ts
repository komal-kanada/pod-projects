/**
 * `pnpm parse [pdf]` — parse, clean, find sections and chunk, with no API
 * calls and no database. Writes data/parsed/pages.json and
 * chunks.preview.json so the result can be checked by hand against the PDF
 * before anything is embedded (PLAN Phase 1–2).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { DOCUMENT } from "../lib/config";
import { prepareDocument } from "../lib/ingest/prepare";
import { loadOutlineSupplement } from "../lib/ingest/supplement";
import { chunkOptions } from "./options";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    chunk: { type: "string" },
    overlap: { type: "string" },
    "no-header": { type: "boolean", default: false },
  },
});

const file = positionals[0] ?? DOCUMENT.path;
const data = new Uint8Array(await readFile(file));
const prepared = await prepareDocument(data, chunkOptions(values), await loadOutlineSupplement());

await mkdir("data/parsed", { recursive: true });
await writeFile(
  "data/parsed/pages.json",
  JSON.stringify({ outline: prepared.outline, sections: prepared.sections, pages: prepared.pages }, null, 2),
);
await writeFile("data/parsed/chunks.preview.json", JSON.stringify(prepared.chunks, null, 2));

console.log(`\n${file}`);
console.table(prepared.stats);
console.log(`\nSections (${prepared.structureSource}):`);
for (const section of prepared.sections.slice(0, 40)) console.log(`  · ${section}`);
if (prepared.sections.length > 40) console.log(`  … ${prepared.sections.length - 40} more`);
console.log("\nWrote data/parsed/pages.json and data/parsed/chunks.preview.json");
console.log("Check by hand: the cover, a narrative page, a table page, a multi-column page, the last page.\n");
