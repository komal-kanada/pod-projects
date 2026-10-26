import { normaliseForSearch, parseNumber } from "../../normalize/units";

/**
 * Numeric exact match in code, not by a judge (09 §6): pull (number, unit)
 * pairs from the answer and require every expected value to be there, with
 * units compared after normalisation (kg ≡ kilograms, % ≡ percent).
 */
export function canonicalUnit(unit: string): string {
  const words = normaliseForSearch(unit).toLowerCase().split(/\s+/).filter(Boolean);
  return words.join(" ");
}

export function numberUnitPairs(answer: string): { value: number; unit: string }[] {
  const text = answer.replace(/\[\d+(?:,\s*\d+)*\]/g, " ");
  const pairs: { value: number; unit: string }[] = [];
  for (const match of text.matchAll(/(?<![\w.])[−-]?\d[\d,]*(?:\.\d+)?/g)) {
    const value = parseNumber(match[0]);
    if (value === null) continue;
    const after = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 24);
    pairs.push({ value, unit: canonicalUnit(after.match(/^\s*(%|percent|per cent|kg\s*CO\s?[₂2]\s?e|kg|kilograms?|g|grams?|kWh|kilowatt[- ]hours?|W|watts?|CO\s?[₂2]\s?e)?/i)?.[1] ?? "") });
  }
  return pairs;
}

export function numericMatch(answer: string, expected: { value: string; unit: string }[]): number | null {
  if (expected.length === 0) return null;
  const pairs = numberUnitPairs(answer);
  const ok = expected.every((e) => {
    const value = parseNumber(e.value);
    const unit = canonicalUnit(e.unit);
    return pairs.some((p) => value !== null && Math.abs(p.value - value) < 1e-9 && (!unit || p.unit === unit || p.unit.startsWith(unit)));
  });
  return ok ? 1 : 0;
}

/**
 * An estimated chart value stated without a hedge is a defect (target 0).
 * Looks for the value in the answer with no "approximately/about/~" before it.
 */
export function statesEstimateAsExact(answer: string, estimates: string[]): boolean {
  return estimates.some((valueText) => {
    const bare = valueText.replace(/^~\s*/, "").trim();
    if (!bare || !/\d/.test(bare)) return false;
    const escaped = bare.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const match of answer.matchAll(new RegExp(`(?<![\\d.])${escaped}(?![\\d])`, "g"))) {
      const before = answer.slice(Math.max(0, (match.index ?? 0) - 40), match.index).toLowerCase();
      if (!/(approx|about|around|roughly|~|nearly|estimated|appears|visually)/.test(before)) return true;
    }
    return false;
  });
}
