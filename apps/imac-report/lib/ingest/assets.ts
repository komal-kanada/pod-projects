import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CONFIG, DOCUMENT } from "../config";
import { cropPng } from "../render/crop";
import type { Element, RenderedPage } from "../types";

/**
 * Page images and element crops the app serves from public/report/
 * (committed — one small report needs no storage service, D10):
 * page images for the Explorer, crops for source cards and for the answer
 * model in preset M4.
 */
export const CROP_TYPES = new Set(["table", "chart", "callout"]);

export function pageImagePath(page: number) {
  return `/report/pages/page-${String(page).padStart(2, "0")}.png`;
}

export function cropImagePath(key: string) {
  return `/report/crops/${key}.png`;
}

export async function publishAssets(
  pages: RenderedPage[],
  elements: Element[],
  { log = console.log, publicDir = DOCUMENT.publicDir }: { log?: (line: string) => void; publicDir?: string } = {},
): Promise<Map<string, string>> {
  await mkdir(path.join(publicDir, "pages"), { recursive: true });
  await mkdir(path.join(publicDir, "crops"), { recursive: true });

  for (const page of pages) {
    const out = path.join("public", pageImagePath(page.page));
    await writeFile(out, await sharp(page.imagePath).resize({ width: Math.min(1400, page.width) }).png({ compressionLevel: 9 }).toBuffer());
  }

  const crops = new Map<string, string>();
  const pageByNumber = new Map(pages.map((p) => [p.page, p]));
  for (const element of elements) {
    if (!CROP_TYPES.has(element.type) || !element.bbox) continue;
    const page = pageByNumber.get(element.page);
    if (!page) continue;
    const png = await cropPng(page.imagePath, element.bbox, { padding: CONFIG.extraction.cropPadding, maxWidth: 1200 });
    await writeFile(path.join("public", cropImagePath(element.key)), png);
    crops.set(element.key, cropImagePath(element.key));
  }
  log(`  published ${pages.length} page images and ${crops.size} crops to ${publicDir}/`);
  return crops;
}
