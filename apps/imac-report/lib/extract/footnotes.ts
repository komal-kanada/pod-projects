import type { BBox, Element, FootnoteLink, RenderedPage } from "../types";

/**
 * Footnote linking (04 §4): markers come from the model's footnoteRefs,
 * "^n" in the extracted text, and text-layer superscripts inside the
 * element's box (their union). Each marker resolves to a footnote on the
 * same page first, then anywhere in the document (end-notes sections).
 */
function inside(inner: BBox, outer: BBox): boolean {
  const cy = (inner[0] + inner[2]) / 2;
  const cx = (inner[1] + inner[3]) / 2;
  return cy >= outer[0] - 5 && cy <= outer[2] + 5 && cx >= outer[1] - 5 && cx <= outer[3] + 5;
}

function elementText(element: Element): string {
  switch (element.type) {
    case "table":
      return [element.title, ...element.columns, ...element.rows.flat(), element.notes].join(" ");
    case "chart":
      return [element.title, element.description, ...element.series.flatMap((s) => [s.name, ...s.points.map((p) => p.label)])].join(" ");
    case "image":
      return element.description;
    default:
      return element.text;
  }
}

export function markersFor(element: Element, page: RenderedPage | undefined): string[] {
  const markers = new Set(element.footnoteRefs.map((m) => m.trim()).filter(Boolean));
  for (const match of elementText(element).matchAll(/\^(\d+|[*†‡§])/g)) markers.add(match[1]);
  if (page && element.bbox) {
    for (const line of page.lines) if (line.superscript && inside(line.bbox, element.bbox)) markers.add(line.text.trim());
  }
  return [...markers];
}

export function linkFootnotes(elements: Element[], pages: RenderedPage[]): { links: FootnoteLink[]; unresolved: { elementKey: string; marker: string }[] } {
  const footnotes = elements.filter((e): e is Extract<Element, { type: "footnote" }> => e.type === "footnote");
  const pageByNumber = new Map(pages.map((p) => [p.page, p]));
  const links: FootnoteLink[] = [];
  const unresolved: { elementKey: string; marker: string }[] = [];

  for (const element of elements) {
    if (element.type === "footnote") continue;
    for (const marker of markersFor(element, pageByNumber.get(element.page))) {
      const target =
        footnotes.find((f) => f.marker === marker && f.page === element.page) ??
        footnotes.find((f) => f.marker === marker && f.page > element.page) ??
        footnotes.find((f) => f.marker === marker);
      if (target) {
        if (!links.some((l) => l.elementKey === element.key && l.footnoteKey === target.key)) {
          links.push({ elementKey: element.key, footnoteKey: target.key, marker });
        }
      } else {
        unresolved.push({ elementKey: element.key, marker });
      }
    }
  }
  return { links, unresolved };
}
