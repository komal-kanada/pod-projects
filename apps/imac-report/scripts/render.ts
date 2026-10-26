/** `pnpm render` — page PNGs (170 DPI) and the text layer with font sizes, cached in data/cache/. */
import { readFile } from "node:fs/promises";
import { CONFIG, DOCUMENT } from "../lib/config";
import { renderDocument } from "../lib/render/pages";

const data = new Uint8Array(await readFile(DOCUMENT.path));
const pages = await renderDocument(data, { cacheDir: DOCUMENT.cacheDir, dpi: CONFIG.extraction.renderDpi });
const supers = pages.reduce((sum, p) => sum + p.lines.filter((l) => l.superscript).length, 0);
console.log(`\nRendered ${pages.length} pages. ${supers} superscript markers detected in the text layer.`);
console.log("Check 3 pages: do the superscripts match the footnote markers you see in the PDF?");
console.log("Next: label eval/ground-truth/*.json by hand, then pnpm extract --strategy X0,X1,X2");
