import { cleanPages } from "@pod/rag/clean";
import { readPdf } from "@pod/rag/pdf";
import { flattenOutline } from "@pod/rag/pdf";

/**
 * The text layer: exact characters and numbers, but flattened tables and no
 * structure. Here it is the *ground truth for numbers* that Gemini's
 * markdown is checked against, the B0 baseline's input, and the fallback
 * for pages Gemini gets wrong.
 */
export async function readTextLayer(data: Uint8Array) {
  const pdf = await readPdf(data);
  const { pages, stats } = cleanPages(pdf.pages.map((page) => page.text));
  return {
    pageCount: pdf.pageCount,
    pageLabels: pdf.pages.map((page) => page.pageLabel),
    outline: flattenOutline(pdf.outline).map(({ title, pageNumber, level }) => ({ title, pageNumber, level })),
    textPages: pages,
    cleanStats: stats,
  };
}
