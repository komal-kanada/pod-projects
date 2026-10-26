import { overlapTail, splitRecursively } from "@pod/rag/split";
import { CONFIG } from "../config";
import type { ChartElement } from "../extract/charts";
import type { TableElement } from "../extract/tables";
import { phasesIn, variantsIn } from "../normalize/glossary";
import { hasNumbers, normaliseForSearch, unitsIn } from "../normalize/units";
import type { DerivedChunk, Element, FootnoteLink } from "../types";
import { chartFacts, chartSummary } from "./chart-facts";
import { chunkHeader } from "./header";
import { elementMarkdown, elementPlainText, elementTitle } from "./markdown";
import { rowSentences, tableSummary } from "./table-rows";

/**
 * Elements → derived chunks (05). Store faithful, retrieve through
 * sentences, answer from the faithful form. Every typed chunk carries its
 * element's key; context is rebuilt from elements, not chunks.
 */

const PRODUCT = /\b(iMac|Mac|port|ports|inch|core|GPU|CPU|GB|TB|M\d)\b/;

/** Product configurations named in the report's own table headers. */
export function buildVariantVocab(elements: Element[]): string[] {
  const names = new Set<string>();
  for (const element of elements) {
    if (element.type !== "table") continue;
    const headerCells = [...element.columns, ...element.rows.map((row) => row.slice(0, Math.max(1, element.rowHeaderCols)).join(" "))];
    for (const cell of headerCells) {
      const text = cell.replace(/\^\S+/g, "").trim();
      if (text.length >= 4 && text.length <= 60 && PRODUCT.test(text)) names.add(text);
    }
  }
  return [...names].sort((a, b) => b.length - a.length);
}

function notesFor(element: Element, links: FootnoteLink[], byKey: Map<string, Element>): string[] {
  return links
    .filter((l) => l.elementKey === element.key)
    .map((l) => byKey.get(l.footnoteKey))
    .filter((f): f is Extract<Element, { type: "footnote" }> => f?.type === "footnote")
    .map((f) => `[${f.marker}] ${f.text}`);
}

export function buildTypedChunks(elements: Element[], links: FootnoteLink[], variantVocab: string[]): DerivedChunk[] {
  const byKey = new Map(elements.map((e) => [e.key, e]));
  const chunks: DerivedChunk[] = [];

  const push = (element: Element, kind: DerivedChunk["kind"], content: string, variantSource = content) => {
    const variants = variantsIn(variantSource, variantVocab);
    const section = element.section ?? null;
    chunks.push({
      elementKey: element.key,
      kind,
      elementType: element.type,
      content,
      embedText: `${chunkHeader({ page: element.page, section, type: element.type, variants })}\n${content}`,
      ftsText: normaliseForSearch(`${elementTitle(element) ?? ""} ${content}`),
      page: element.page,
      section,
      variants,
      phases: phasesIn(content),
      units: unitsIn(content),
      hasNumbers: hasNumbers(content),
      ordinal: chunks.length,
    });
  };

  for (const element of elements) {
    const notes = notesFor(element, links, byKey);
    const noteText = notes.length ? `\nNotes: ${notes.join(" ")}` : "";

    switch (element.type) {
      case "heading":
        break;
      case "text": {
        const pieces = splitRecursively(element.text, CONFIG.chunk.textTargetChars);
        pieces.forEach((piece, i) => push(element, "text", (i > 0 ? `${overlapTail(pieces[i - 1], 150)} ` : "") + piece + noteText));
        break;
      }
      case "table": {
        const table = element as TableElement;
        push(element, "table_summary", tableSummary(table) + noteText, tableSummary(table));
        for (const { sentence } of rowSentences(table, notes)) push(element, "table_row", sentence);
        break;
      }
      case "chart": {
        const chart = element as ChartElement;
        push(element, "chart_summary", chartSummary(chart) + noteText);
        for (const fact of chartFacts(chart, notes)) push(element, "chart_fact", fact);
        break;
      }
      case "footnote": {
        const referrers = links
          .filter((l) => l.footnoteKey === element.key)
          .map((l) => byKey.get(l.elementKey))
          .filter(Boolean)
          .map((e) => elementTitle(e!) ?? `${e!.type} on page ${e!.page}`);
        push(element, "footnote", `Footnote ${element.marker}: ${element.text}${referrers.length ? `\nReferenced by: ${[...new Set(referrers)].join("; ")}` : ""}`);
        break;
      }
      case "callout":
        push(element, "callout", elementPlainText(element) + (element.iconMeaning ? ` (${element.iconMeaning})` : "") + noteText);
        break;
      case "image":
        if (element.description.length > 40) push(element, "image", `Image: ${element.description}`);
        break;
    }
  }
  return chunks;
}

/** M0/M1: fixed-size chunks over each page's text (X0) or element markdown (X1). */
export function buildFlatChunks(elements: Element[]): DerivedChunk[] {
  const pages = new Map<number, Element[]>();
  for (const element of elements) pages.set(element.page, [...(pages.get(element.page) ?? []), element]);

  const chunks: DerivedChunk[] = [];
  for (const [page, pageElements] of [...pages].sort((a, b) => a[0] - b[0])) {
    const text = pageElements.sort((a, b) => a.order - b.order).map(elementMarkdown).join("\n\n");
    const pieces = splitRecursively(text, CONFIG.chunk.flatTargetChars);
    pieces.forEach((piece, i) => {
      const content = (i > 0 ? `${overlapTail(pieces[i - 1], CONFIG.chunk.flatOverlapChars)}\n\n` : "") + piece;
      chunks.push({
        elementKey: null,
        kind: "flat",
        elementType: null,
        content,
        embedText: `${chunkHeader({ page, section: null, type: "page text", variants: [] })}\n${content}`,
        ftsText: normaliseForSearch(content),
        page,
        section: null,
        variants: [],
        phases: phasesIn(content),
        units: unitsIn(content),
        hasNumbers: hasNumbers(content),
        ordinal: chunks.length,
      });
    });
  }
  return chunks;
}
