import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as mupdf from "mupdf";
import { sha256 } from "@pod/rag/hash";
import type { RenderedPage } from "../types";
import { linesFromStructuredText, linesToText } from "./text-layer";

/**
 * Renders every page to PNG and reads its text layer with mupdf (WASM, no
 * native install). Cached in data/cache/pages and data/cache/text-layer.
 */
export async function renderDocument(
  data: Uint8Array,
  { cacheDir, dpi, log = console.log }: { cacheDir: string; dpi: number; log?: (line: string) => void },
): Promise<RenderedPage[]> {
  const doc = mupdf.Document.openDocument(data, "application/pdf");
  const count = doc.countPages();
  await mkdir(path.join(cacheDir, "pages"), { recursive: true });
  await mkdir(path.join(cacheDir, "text-layer"), { recursive: true });

  const pages: RenderedPage[] = [];
  for (let i = 0; i < count; i += 1) {
    const number = i + 1;
    const name = `page-${String(number).padStart(2, "0")}`;
    const page = doc.loadPage(i);
    const [x0, y0, x1, y1] = page.getBounds();
    const width = x1 - x0;
    const height = y1 - y0;

    const scale = dpi / 72;
    const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
    const png = pixmap.asPNG();
    const imagePath = path.join(cacheDir, "pages", `${name}.png`);
    await writeFile(imagePath, png);

    const stext = JSON.parse(page.toStructuredText("preserve-whitespace").asJSON());
    const { lines, bodySize } = linesFromStructuredText(stext, width, height);
    const rendered: RenderedPage = {
      page: number,
      imagePath,
      width: pixmap.getWidth(),
      height: pixmap.getHeight(),
      imageHash: sha256(png).slice(0, 16),
      lines,
      text: linesToText(lines),
      bodySize,
    };
    await writeFile(path.join(cacheDir, "text-layer", `${name}.json`), JSON.stringify(rendered, null, 1));
    pages.push(rendered);
    log(`  rendered page ${number}/${count} (${rendered.width}×${rendered.height}, ${lines.length} lines, ${lines.filter((l) => l.superscript).length} superscripts)`);
  }
  return pages;
}

export async function loadRenderedPages(cacheDir: string): Promise<RenderedPage[]> {
  const { readdir } = await import("node:fs/promises");
  const dir = path.join(cacheDir, "text-layer");
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    throw new Error(`${dir} not found. Run \`pnpm render\` first.`);
  }
  if (files.length === 0) throw new Error("No rendered pages. Run `pnpm render` first.");
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(dir, f), "utf8")) as RenderedPage));
}

/** One page at a higher DPI — the focused pass crops its table/chart from this. */
export function renderPageAt(data: Uint8Array, page: number, dpi: number): Uint8Array {
  const doc = mupdf.Document.openDocument(data, "application/pdf");
  const scale = dpi / 72;
  return doc.loadPage(page - 1).toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true).asPNG();
}
