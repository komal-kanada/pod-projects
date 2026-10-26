import type { BBox, TextLine } from "../types";

/**
 * mupdf structured text → lines with normalised boxes and font sizes.
 *
 * The text layer is the ground truth for characters and numbers. Font size
 * and baseline also reveal footnote markers: a superscript is a short run
 * set noticeably smaller than body text, raised above its neighbour's
 * baseline (04 §1).
 */
interface StextLine {
  bbox: { x: number; y: number; w: number; h: number };
  font: { size: number };
  y: number;
  text: string;
}

interface StextJson {
  blocks: { type: string; lines?: StextLine[] }[];
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function toBBox(box: { x: number; y: number; w: number; h: number }, width: number, height: number): BBox {
  const clamp = (v: number) => Math.max(0, Math.min(1000, Math.round(v)));
  return [clamp((box.y / height) * 1000), clamp((box.x / width) * 1000), clamp(((box.y + box.h) / height) * 1000), clamp(((box.x + box.w) / width) * 1000)];
}

export function linesFromStructuredText(json: StextJson, width: number, height: number): { lines: TextLine[]; bodySize: number } {
  const raw = json.blocks.flatMap((block) => (block.type === "text" ? block.lines ?? [] : [])).filter((line) => line.text.trim());
  // Body size: the size covering the most characters.
  const weight = new Map<number, number>();
  for (const line of raw) {
    const size = Math.round(line.font.size * 2) / 2;
    weight.set(size, (weight.get(size) ?? 0) + line.text.length);
  }
  const bodySize = [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;

  const lines = raw.map((line) => {
    const short = line.text.trim().length <= 3;
    const small = line.font.size <= bodySize * 0.8;
    // Raised: some other line overlaps it vertically but sits lower.
    const raised = raw.some(
      (other) => other !== line && other.font.size > line.font.size && other.y > line.y + 0.5 && Math.abs(other.bbox.y - line.bbox.y) < other.bbox.h,
    );
    return {
      text: line.text,
      bbox: toBBox(line.bbox, width, height),
      size: line.font.size,
      superscript: short && small && raised && /^[\d*†‡§a-z]{1,3}$/i.test(line.text.trim()),
    };
  });

  return { lines, bodySize };
}

/** Lines in reading order joined as plain text (for prompts and fidelity). */
export function linesToText(lines: TextLine[]): string {
  return lines
    .filter((line) => !line.superscript)
    .map((line) => line.text.trim())
    .join("\n");
}

/** Text whose line boxes fall inside a region — the hint for focused passes. */
export function textInside(lines: TextLine[], box: BBox): string {
  const [y0, x0, y1, x1] = box;
  return lines
    .filter((line) => {
      const cy = (line.bbox[0] + line.bbox[2]) / 2;
      const cx = (line.bbox[1] + line.bbox[3]) / 2;
      return cy >= y0 && cy <= y1 && cx >= x0 && cx <= x1;
    })
    .map((line) => line.text.trim())
    .join("\n");
}
