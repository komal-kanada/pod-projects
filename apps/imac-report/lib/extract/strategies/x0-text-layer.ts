import type { BBox, Element, RenderedPage, TextLine } from "../../types";
import type { Strategy } from "./types";

/**
 * X0 — the text layer only (baseline). Lines are grouped into paragraphs by
 * position and size; big short lines are headings; small lines at the
 * bottom starting with a marker are footnotes; running headers/footers go.
 * Tables and charts come out as loose text — which is exactly what this
 * baseline is meant to show.
 */
function union(lines: TextLine[]): BBox {
  return [
    Math.min(...lines.map((l) => l.bbox[0])),
    Math.min(...lines.map((l) => l.bbox[1])),
    Math.max(...lines.map((l) => l.bbox[2])),
    Math.max(...lines.map((l) => l.bbox[3])),
  ];
}

function edgeKey(line: TextLine) {
  return line.text.toLowerCase().replace(/\d+/g, "#").trim();
}

export const x0TextLayer: Strategy = {
  id: "X0",
  version: () => "x0-v1",
  async extractPage(page: RenderedPage, ctx) {
    // Running headers/footers: edge lines (top/bottom 6%) repeated on ≥30% of pages, or bare numbers.
    const edgeCounts = new Map<string, number>();
    for (const p of ctx.pages) {
      for (const key of new Set(p.lines.filter((l) => l.bbox[0] < 60 || l.bbox[2] > 940).map(edgeKey))) {
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
      }
    }
    const minRepeat = Math.max(2, Math.ceil(ctx.pages.length * 0.3));
    const isChrome = (l: TextLine) =>
      (l.bbox[0] < 60 || l.bbox[2] > 940) && ((edgeCounts.get(edgeKey(l)) ?? 0) >= minRepeat || /^\s*\d{1,3}\s*$/.test(l.text));

    const lines = page.lines.filter((l) => !l.superscript && !isChrome(l)).sort((a, b) => a.bbox[0] - b.bbox[0] || a.bbox[1] - b.bbox[1]);
    const superscripts = page.lines.filter((l) => l.superscript);

    const elements: Element[] = [];
    let group: TextLine[] = [];
    let order = 0;
    const key = () => `X0-p${String(page.page).padStart(2, "0")}-e${String(order).padStart(2, "0")}`;

    // A marker sits just past the word it qualifies and slightly raised, so it
    // can fall a little outside the paragraph's box: allow a margin.
    const refsIn = (box: BBox) =>
      superscripts
        .filter((s) => s.bbox[0] >= box[0] - 10 && s.bbox[2] <= box[2] + 10 && s.bbox[1] >= box[1] - 5 && s.bbox[3] <= box[3] + 30)
        .map((s) => s.text.trim());

    const flush = () => {
      if (group.length === 0) return;
      const text = group.map((l) => l.text.trim()).join(" ").replace(/\s+/g, " ");
      const bbox = union(group);
      const size = group[0].size;
      const isFootnote = bbox[0] > 750 && size < page.bodySize * 0.92 && /^(\d{1,2}|[*†‡§])\s*\S/.test(text);
      const isHeading = size >= page.bodySize * 1.2 && text.length < 90;
      if (isFootnote) {
        const marker = text.match(/^(\d{1,2}|[*†‡§])/)![1];
        elements.push({ key: key(), page: page.page, bbox, order: order++, footnoteRefs: [], type: "footnote", marker, text: text.slice(marker.length).trim() });
      } else if (isHeading) {
        elements.push({ key: key(), page: page.page, bbox, order: order++, footnoteRefs: refsIn(bbox), type: "heading", level: size >= page.bodySize * 1.6 ? 1 : 2, text });
      } else {
        elements.push({ key: key(), page: page.page, bbox, order: order++, footnoteRefs: refsIn(bbox), type: "text", text });
      }
      group = [];
    };

    for (const line of lines) {
      const last = group.at(-1);
      const lineHeight = last ? last.bbox[2] - last.bbox[0] : 0;
      const sameBlock =
        last &&
        Math.abs(line.size - last.size) < 0.6 &&
        line.bbox[0] - last.bbox[2] < Math.max(8, lineHeight * 0.9) &&
        Math.abs(line.bbox[1] - group[0].bbox[1]) < 150;
      if (!sameBlock) flush();
      group.push(line);
    }
    flush();
    return elements;
  },
};
