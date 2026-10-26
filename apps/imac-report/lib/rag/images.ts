import { readFile } from "node:fs/promises";
import path from "node:path";
import { binaryPart, type Part } from "@pod/ai";

/**
 * Crops live in public/report/. On Vercel the `public/` folder isn't part of
 * the function's filesystem unless traced, so next.config includes
 * public/report/crops/** for the routes that need it.
 */
export async function loadImageParts(images: { n: number; path: string }[]): Promise<Part[]> {
  const parts: Part[] = [];
  for (const image of images) {
    try {
      const bytes = await readFile(path.join(process.cwd(), "public", image.path));
      parts.push({ text: `Image for source ${image.n}:` }, binaryPart(bytes, "image/png"));
    } catch {
      // A missing crop just means that source goes in as text only.
    }
  }
  return parts;
}
