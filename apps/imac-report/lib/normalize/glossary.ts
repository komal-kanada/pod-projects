/**
 * Domain synonyms (05 §5): small, hand-made, every entry deliberate. Used to
 * expand keyword queries ("carbon footprint" also matches "greenhouse gas
 * emissions") and as a vocabulary hint for query analysis. Extend it in
 * Phase 3 from the report's own wording and the sample questions.
 */
export const GLOSSARY: string[][] = [
  ["carbon footprint", "life cycle carbon emissions", "greenhouse gas emissions", "co2e", "emissions"],
  ["recycled content", "recycled material", "secondary material", "recycled"],
  ["packaging", "fiber-based packaging", "plastic packaging"],
  ["energy efficiency", "power consumption", "energy consumption", "energy use"],
  ["end of life", "recycling", "disposal", "end-of-life"],
  ["production", "manufacturing"],
  ["use phase", "customer use", "product use"],
  ["transport", "transportation", "shipping"],
];

export const PHASES: Record<string, string[]> = {
  production: ["production", "manufacturing"],
  transport: ["transport", "transportation", "shipping"],
  use: ["use phase", "product use", "customer use", "use"],
  end_of_life: ["end of life", "end-of-life", "recycling", "disposal"],
};

/** Life-cycle phases mentioned in a text. */
export function phasesIn(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.entries(PHASES)
    .filter(([phase, words]) => words.some((word) => (phase === "use" ? /\buse phase\b|\bproduct use\b|\bcustomer use\b/.test(lower) : lower.includes(word))))
    .map(([phase]) => phase);
}

/**
 * A websearch_to_tsquery string where each glossary term in the question is
 * replaced by "term OR synonym OR …". websearch syntax has no parentheses,
 * but `a OR b` binds tighter than the implicit AND between words, so
 * "carbon footprint of iMac" becomes (carbon footprint | ghg emissions | …) & imac.
 */
export function expandQuery(query: string): string {
  let out = query;
  for (const group of GLOSSARY) {
    // Longest terms first so "life cycle carbon emissions" wins over "emissions".
    const term = [...group].sort((a, b) => b.length - a.length).find((t) => new RegExp(`\\b${t.replace(/[-]/g, "[- ]")}\\b`, "i").test(out));
    if (!term) continue;
    const alternatives = group.map((t) => (t.includes(" ") || t.includes("-") ? `"${t}"` : t)).join(" OR ");
    out = out.replace(new RegExp(`\\b${term.replace(/[-]/g, "[- ]")}\\b`, "i"), alternatives);
  }
  return out;
}

/**
 * Product configurations: built from the report's own table row headers at
 * ingest (the vocabulary isn't known before reading the report).
 */
export function variantsIn(text: string, vocab: string[]): string[] {
  const lower = text.toLowerCase();
  return vocab.filter((variant) => lower.includes(variant.toLowerCase()));
}
