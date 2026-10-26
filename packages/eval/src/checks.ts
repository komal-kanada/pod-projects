/**
 * Deterministic answer checks that need no judge.
 */

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tidy = (text: string) => text.replace(/\[\d+(?:,\s*\d+)*\]/g, " ").replace(/\s+/g, " ").toLowerCase();

/**
 * The phrases from `forbidden` that the answer contains — whole words,
 * ignoring case, spacing and citation markers. "Asia" doesn't match inside
 * "Eurasia", and "2.5" doesn't match inside "12.5".
 */
export function forbiddenMentions(answer: string, forbidden: string[]): string[] {
  const text = tidy(answer);
  return forbidden.filter((phrase) => {
    const needle = tidy(phrase).trim();
    return needle.length > 0 && new RegExp(`(?<![\\p{L}\\p{N}.])${escape(needle)}(?![\\p{L}\\p{N}]|\\.\\d)`, "u").test(text);
  });
}
