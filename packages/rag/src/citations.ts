/**
 * Citations are `[n]` references to numbered context blocks, mapped to pages
 * in code — the model never writes page numbers itself, so it can't invent
 * them, and a reference to a block that doesn't exist is detectable.
 */

export interface ParsedCitations {
  /** Distinct valid references, in order of first use. */
  valid: number[];
  /** References outside 1..sourceCount — the model made them up. */
  invalid: number[];
}

const CITATION_GROUP = /\[(\s*\d+\s*(?:[,;–-]\s*\d+\s*)*)\]/g;

/** Every number inside `[1]`, `[1, 3]` or `[2–4]` groups, in order. */
export function citationNumbers(text: string): number[] {
  const numbers: number[] = [];
  for (const match of text.matchAll(CITATION_GROUP)) {
    for (const part of match[1].split(/[,;]/)) {
      const range = part.split(/[–-]/).map((value) => Number.parseInt(value, 10));
      if (range.length === 2 && range[1] >= range[0] && range[1] - range[0] < 20) {
        for (let n = range[0]; n <= range[1]; n += 1) numbers.push(n);
      } else if (Number.isFinite(range[0])) {
        numbers.push(range[0]);
      }
    }
  }
  return numbers;
}

export function parseCitations(text: string, sourceCount: number): ParsedCitations {
  const valid: number[] = [];
  const invalid: number[] = [];
  for (const n of citationNumbers(text)) {
    const bucket = n >= 1 && n <= sourceCount ? valid : invalid;
    if (!bucket.includes(n)) bucket.push(n);
  }
  return { valid, invalid };
}

/** Splits text into plain runs and citation groups, for rendering badges. */
export type CitationSegment =
  | { kind: "text"; text: string }
  | { kind: "cite"; numbers: number[] };

export function segmentCitations(text: string): CitationSegment[] {
  const segments: CitationSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(CITATION_GROUP)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ kind: "text", text: text.slice(last, index) });
    segments.push({ kind: "cite", numbers: citationNumbers(match[0]) });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}

/** A refusal is the fixed sentence, possibly with trailing punctuation/space. */
export function isRefusal(answer: string, refusalText: string): boolean {
  const normalise = (value: string) =>
    value.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' ]/g, "").replace(/\s+/g, " ").trim();
  const a = normalise(answer);
  const r = normalise(refusalText);
  return a === r || (a.startsWith(r) && a.length < r.length + 20);
}
