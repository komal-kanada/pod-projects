/**
 * Splitting text into pieces that fit a size limit, breaking at the largest
 * natural boundary that still fits: paragraphs, then lines, then sentences,
 * then clauses, then words. Sizes are characters, not tokens — no tokeniser
 * needed, and ~4 characters per token is accurate enough for budgeting.
 */

const SEPARATORS = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " "];

export function splitRecursively(text: string, limit: number, depth = 0): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= limit) return [trimmed];

  const separator = SEPARATORS[depth];

  // Out of separators: cut on length. Only pathological input gets here,
  // such as one unbroken run of characters.
  if (separator === undefined) {
    const pieces: string[] = [];
    for (let start = 0; start < trimmed.length; start += limit) {
      pieces.push(trimmed.slice(start, start + limit));
    }
    return pieces;
  }

  // Keep sentence punctuation with the sentence it ends.
  const keep = separator.trimEnd();
  const parts = trimmed
    .split(separator)
    .map((part, index, all) =>
      keep && keep !== separator && index < all.length - 1 ? part + keep : part,
    );
  const joiner = keep && keep !== separator ? " " : separator;

  const merged: string[] = [];
  let current = "";

  for (const part of parts) {
    const candidate = current ? `${current}${joiner}${part}` : part;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    if (current) merged.push(current);
    if (part.length > limit) {
      merged.push(...splitRecursively(part, limit, depth + 1));
      current = "";
    } else {
      current = part;
    }
  }

  if (current) merged.push(current);
  return merged.map((piece) => piece.trim()).filter(Boolean);
}

/** Sentence boundaries: terminal punctuation followed by a capital or digit. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=["“(\p{Lu}\d])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * The last ~`chars` characters of `text`, trimmed forward to a sentence start
 * so overlap never begins mid-word.
 */
export function overlapTail(text: string, chars: number): string {
  if (chars <= 0 || !text) return "";
  if (text.length <= chars) return text.trim();
  const tail = text.slice(-chars);
  const boundary = tail.search(/[.!?]\s+\S|\n/);
  return (boundary === -1 ? tail.slice(tail.indexOf(" ") + 1) : tail.slice(boundary + 1)).trim();
}

/** The last full sentence of a text, for one-sentence overlap. */
export function lastSentence(text: string): string {
  const sentences = splitSentences(text);
  return sentences.at(-1) ?? "";
}
