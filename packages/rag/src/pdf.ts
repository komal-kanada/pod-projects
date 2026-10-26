import { extractText, getDocumentProxy } from "unpdf";

/**
 * Reads a PDF's text layer, page labels and outline (bookmarks).
 *
 * - Text is extracted page by page so every chunk can carry its pages.
 * - Page labels are the numbers printed on the page ("iv", "12"). Reports
 *   often number front matter in roman numerals, so the printed number and
 *   the PDF index differ; citations show the printed one.
 * - The outline is the most reliable source of section headings when the
 *   publisher included it.
 *
 * `unpdf` wraps pdf.js with no native dependencies, so this runs the same in
 * scripts, tests and serverless functions.
 */

export interface PdfPage {
  /** 1-based PDF page index — what we store and cite internally. */
  pageNumber: number;
  /** Printed label if the PDF defines one, else the page number as text. */
  pageLabel: string;
  text: string;
}

export interface OutlineEntry {
  title: string;
  /** 1-based page the entry points to, or null if it can't be resolved. */
  pageNumber: number | null;
  level: number;
  children: OutlineEntry[];
}

export interface PdfDocument {
  pageCount: number;
  pages: PdfPage[];
  outline: OutlineEntry[];
  hasPageLabels: boolean;
}

export class PdfReadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PdfReadError";
  }
}

type PdfProxy = Awaited<ReturnType<typeof getDocumentProxy>>;

interface RawOutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items: RawOutlineItem[];
}

export async function readPdf(data: Uint8Array): Promise<PdfDocument> {
  let pdf: PdfProxy;
  try {
    // pdf.js takes ownership of the buffer it is given; copy so callers can
    // keep using theirs.
    pdf = await getDocumentProxy(new Uint8Array(data));
  } catch (cause) {
    throw new PdfReadError(
      "That PDF couldn't be opened. It may be corrupt or password protected.",
      { cause },
    );
  }

  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const labels = (await pdf.getPageLabels()) as string[] | null;
  const outline = await readOutline(pdf);

  const pages = text.map((pageText, index) => ({
    pageNumber: index + 1,
    pageLabel: labels?.[index]?.trim() || String(index + 1),
    text: pageText,
  }));

  return {
    pageCount: totalPages,
    pages,
    outline,
    hasPageLabels: Boolean(labels?.some((label) => label?.trim())),
  };
}

async function readOutline(pdf: PdfProxy): Promise<OutlineEntry[]> {
  const raw = (await pdf.getOutline()) as RawOutlineItem[] | null;
  if (!raw) return [];

  async function resolvePage(dest: RawOutlineItem["dest"]): Promise<number | null> {
    try {
      const explicit = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
      if (!Array.isArray(explicit) || explicit.length === 0) return null;
      const ref = explicit[0];
      if (typeof ref === "number") return ref + 1;
      const index = await pdf.getPageIndex(ref as Parameters<PdfProxy["getPageIndex"]>[0]);
      return index + 1;
    } catch {
      return null;
    }
  }

  async function walk(items: RawOutlineItem[], level: number): Promise<OutlineEntry[]> {
    const entries: OutlineEntry[] = [];
    for (const item of items) {
      entries.push({
        title: item.title.replace(/\s+/g, " ").trim(),
        pageNumber: await resolvePage(item.dest),
        level,
        children: await walk(item.items ?? [], level + 1),
      });
    }
    return entries;
  }

  return walk(raw, 1);
}

/** Depth-first list of outline entries, in document order. */
export function flattenOutline(outline: OutlineEntry[]): OutlineEntry[] {
  return outline.flatMap((entry) => [entry, ...flattenOutline(entry.children)]);
}
