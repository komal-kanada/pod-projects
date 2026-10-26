import { cleanPages } from "@pod/rag/clean";
import { flattenOutline, readPdf } from "@pod/rag/pdf";
import { RAG_CONFIG, type ChunkConfig } from "../config";
import { chunkParagraphs, chunkStats } from "./chunker";
import { assignSections, type SupplementEntry } from "./structure";

/**
 * Parse → clean → structure → chunk. Everything up to (not including)
 * embeddings, with no API calls — so `pnpm parse` can show exactly what the
 * pipeline thinks the report says before anything is paid for.
 */
export async function prepareDocument(
  data: Uint8Array,
  chunkConfig: ChunkConfig = RAG_CONFIG.chunk,
  supplement: SupplementEntry[] = [],
) {
  const pdf = await readPdf(data);
  const { pages: cleaned, stats: cleanStats } = cleanPages(pdf.pages.map((page) => page.text));

  const pages = pdf.pages.map((page, index) => ({
    pageNumber: page.pageNumber,
    pageLabel: page.pageLabel,
    rawChars: page.text.length,
    text: cleaned[index],
  }));

  const structure = assignSections(pages, pdf.outline, supplement);
  const labels = new Map(pages.map((page) => [page.pageNumber, page.pageLabel]));
  const chunks = chunkParagraphs(structure.paragraphs, labels, chunkConfig);

  return {
    pageCount: pdf.pageCount,
    pages,
    outline: flattenOutline(pdf.outline).map(({ title, pageNumber, level }) => ({ title, pageNumber, level })),
    structureSource: structure.source,
    sections: structure.sections,
    chunks,
    stats: {
      pages: pdf.pageCount,
      pagesWithoutText: pages.filter((page) => !page.text).map((page) => page.pageNumber),
      hasPageLabels: pdf.hasPageLabels,
      outlineEntries: flattenOutline(pdf.outline).length,
      supplementEntries: supplement.length,
      structureSource: structure.source,
      sectionsFound: structure.sections.length,
      ...cleanStats,
      ...chunkStats(chunks),
    },
  };
}

export type PreparedDocument = Awaited<ReturnType<typeof prepareDocument>>;
