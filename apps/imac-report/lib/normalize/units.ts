/**
 * Units and terms normalised for keyword search (05 §5). Applied to a
 * separate `fts_text` column — the displayed text keeps the report's exact
 * wording. "CO₂e", "CO2e" and "carbon dioxide equivalent" all become co2e,
 * so a query in any spelling matches.
 */
const RULES: [RegExp, string][] = [
  [/\bCO\s?[₂2]\s?-?e\b|\bcarbon dioxide equivalents?\b/giu, " co2e "],
  [/\bCO\s?[₂2]\b/giu, " co2 "],
  [/\bkilowatt[- ]hours?\b|\bkWh\b/giu, " kwh "],
  [/\bkilograms?\b|\bkgs?\b/giu, " kg "],
  [/\bgrams?\b/giu, " g "],
  [/(?<=\d)\s?g\b/gu, " g "],
  [/\bwatts?\b/giu, " w "],
  [/(?<=\d)\s?W\b/gu, " w "],
  [/%|\bper ?cent\b/giu, " percent "],
];

export const CANONICAL_UNITS = ["co2e", "co2", "kwh", "kg", "g", "w", "percent"];

export function normaliseForSearch(text: string): string {
  let out = text;
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out.replace(/\s+/g, " ").trim();
}

/** Canonical units present in a text. */
export function unitsIn(text: string): string[] {
  const words = new Set(normaliseForSearch(text).toLowerCase().split(/[^a-z0-9]+/));
  return CANONICAL_UNITS.filter((unit) => words.has(unit));
}

/** Parses "1,234.5", "−3", "<1" style values; null when not a plain number. */
export function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[−–]/g, "-").replace(/,/g, "").replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function hasNumbers(text: string): boolean {
  return /\d/.test(text);
}
