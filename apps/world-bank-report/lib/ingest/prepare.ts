import { joinPages, parsePageBlocks, textLayerBlocks } from "../parse/blocks";
import { buildTree, type OutlineItem } from "../structure/tree";
import type { ParsedReport, ParseSource } from "../types";

/**
 * Parsed pages → blocks → section tree. Pages Gemini couldn't parse
 * faithfully fall back to the text layer (`parse_source = text_layer`).
 */
export function buildDocument(
  parsed: ParsedReport,
  source: "markdown" | "text" = "markdown",
  outline: OutlineItem[] = parsed.outline,
) {
  const pageSource: ParseSource[] = parsed.textPages.map((_, i) =>
    source === "markdown" && parsed.markdownPages[i] !== null ? "gemini" : "text_layer",
  );
  const pageBlocks = parsed.textPages.map((text, i) =>
    pageSource[i] === "gemini" ? parsePageBlocks(parsed.markdownPages[i]!, i + 1) : textLayerBlocks(text, i + 1),
  );
  // A paragraph never runs on into a page where an outline entry starts.
  const starts = new Set(outline.flatMap((entry) => (entry.pageNumber ? [entry.pageNumber] : [])));
  const blocks = joinPages(pageBlocks, starts);
  const tree = buildTree(blocks, outline, parsed.pageCount);
  return { blocks, tree, pageSource };
}
