/**
 * Checks Gemini's markdown against the page's text layer (04 §4).
 *
 * 1. Numeric precision — every number in the markdown (outside figure
 *    descriptions) must appear in the text layer. Vision models misread
 *    digits; the text layer doesn't.
 * 2. Coverage — the share of text-layer words that made it into the
 *    markdown. Catches dropped paragraphs.
 */

export interface PageFidelity {
  page: number;
  numbers: number;
  numericPrecision: number;
  coverage: number;
  unmatchedNumbers: string[];
  ok: boolean;
}

function normaliseNumber(token: string): string {
  return token.replace(/[−–]/g, "-").replace(/,/g, "").replace(/^\+/, "").replace(/\.0+$/, "");
}

export function numberTokens(text: string): string[] {
  return [...text.matchAll(/[−–-]?\d[\d,]*(?:\.\d+)?/g)]
    .map((match) => normaliseNumber(match[0]))
    .filter((token) => token.replace(/-/g, "").length > 0);
}

function words(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}]{3,}/gu) ?? []);
}

/** Markdown minus things that legitimately aren't in the text layer. */
export function checkableMarkdown(markdown: string): string {
  return markdown
    .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, " ")
    .replace(/<\/?(box|footnote)[^>]*>/gi, " ")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, " ")
    .replace(/<<<PAGE \d+>>>/g, " ");
}

export function pageFidelity(
  page: number,
  markdown: string,
  textLayer: string,
  { minNumericPrecision, minCoverage }: { minNumericPrecision: number; minCoverage: number },
): PageFidelity {
  const checkable = checkableMarkdown(markdown);
  const layerNumbers = new Set(numberTokens(textLayer));
  const mdNumbers = numberTokens(checkable);
  const unmatched = mdNumbers.filter((token) => !layerNumbers.has(token) && !layerNumbers.has(token.replace(/^-/, "")));
  const numericPrecision = mdNumbers.length ? (mdNumbers.length - unmatched.length) / mdNumbers.length : 1;

  const layerWords = words(textLayer);
  const mdWords = new Set(words(checkable));
  const coverage = layerWords.length ? layerWords.filter((word) => mdWords.has(word)).length / layerWords.length : 1;

  return {
    page,
    numbers: mdNumbers.length,
    numericPrecision,
    coverage,
    unmatchedNumbers: [...new Set(unmatched)].slice(0, 20),
    ok: numericPrecision >= minNumericPrecision && coverage >= minCoverage,
  };
}
