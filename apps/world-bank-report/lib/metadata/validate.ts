import { COUNTRY_CODES, REGION_CODES } from "./vocab";
import { findCountries, findRegions } from "./extract";
import type { QueryFilters } from "../types";

/**
 * The LLM only *proposes* filters; they are validated here against the
 * vocabularies and the report's real chapter titles. Anything unknown is
 * dropped and reported, so a hallucinated filter can never hide the answer.
 */
export function validateFilters(
  proposed: QueryFilters,
  { chapters, minYear = 1990, maxYear = 2035 }: { chapters: string[]; minYear?: number; maxYear?: number },
): { filters: QueryFilters; dropped: string[] } {
  const dropped: string[] = [];
  const filters: QueryFilters = {};

  const regions = (proposed.regions ?? []).flatMap((value) => {
    const code = value.toUpperCase();
    if (REGION_CODES.includes(code)) return [code];
    const byName = findRegions(value);
    if (byName.length) return byName;
    dropped.push(`region:${value}`);
    return [];
  });
  if (regions.length) filters.regions = [...new Set(regions)];

  const countries = (proposed.countries ?? []).flatMap((value) => {
    const code = value.toUpperCase();
    if (COUNTRY_CODES.includes(code)) return [code];
    const byName = findCountries(value);
    if (byName.length) return byName;
    dropped.push(`country:${value}`);
    return [];
  });
  if (countries.length) filters.countries = [...new Set(countries)];

  const years = (proposed.years ?? []).filter((year) => {
    const ok = Number.isInteger(year) && year >= minYear && year <= maxYear;
    if (!ok) dropped.push(`year:${year}`);
    return ok;
  });
  if (years.length) filters.years = [...new Set(years)];

  const types = (proposed.contentTypes ?? []).filter((type) => {
    const ok = ["table", "figure", "box", "text"].includes(type);
    if (!ok) dropped.push(`type:${type}`);
    return ok;
  });
  if (types.length) filters.contentTypes = types;

  if (proposed.chapter) {
    const match = matchChapter(proposed.chapter, chapters);
    if (match) filters.chapter = match;
    else dropped.push(`chapter:${proposed.chapter}`);
  }

  return { filters, dropped };
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const CHAPTER_NUMBER = /\b(?:chapter|ch\.?)\s*(\d+|one|two|three|four|five|six|seven|eight|nine)\b/i;

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const withoutNumber = (text: string) => norm(text).replace(/^chapter \d+ /, "");

function chapterNumbered(n: number, chapters: string[]): string | null {
  return chapters.find((title) => new RegExp(`^chapter\\s+${n}\\b`, "i").test(title)) ?? null;
}

/**
 * A chapter reference → the report's exact chapter title, or null.
 * Accepts the exact title, the title without its number, "Chapter 3",
 * "ch. 3", "chapter three" or a bare "3".
 */
export function matchChapter(reference: string, chapters: string[]): string | null {
  const exact = chapters.find((title) => norm(title) === norm(reference) || withoutNumber(title) === withoutNumber(reference));
  if (exact) return exact;
  const numbered = CHAPTER_NUMBER.exec(reference)?.[1] ?? (/^\s*(\d+)\s*$/.exec(reference)?.[1] ?? null);
  if (!numbered) return null;
  return chapterNumbered(NUMBER_WORDS[numbered.toLowerCase()] ?? Number(numbered), chapters);
}

/**
 * A chapter the question names outright — "Chapter 3", or a top-level title
 * such as "the executive summary" — so it is filtered on even when query
 * analysis misses it or falls back.
 */
export function chapterInQuestion(question: string, chapters: string[]): string | null {
  const numbered = CHAPTER_NUMBER.exec(question)?.[1];
  if (numbered) return chapterNumbered(NUMBER_WORDS[numbered.toLowerCase()] ?? Number(numbered), chapters);
  const text = ` ${norm(question)} `;
  return chapters.find((title) => !/^chapter \d+/.test(norm(title)) && text.includes(` ${norm(title)} `)) ?? null;
}

/** Order in which filters are relaxed when too few results come back (06 §4). */
export const RELAXATION_ORDER: (keyof QueryFilters)[] = ["contentTypes", "years", "countries", "regions", "chapter"];

export function relaxOnce(filters: QueryFilters): { filters: QueryFilters; relaxed: keyof QueryFilters } | null {
  for (const key of RELAXATION_ORDER) {
    if (filters[key] !== undefined) {
      const next = { ...filters };
      delete next[key];
      return { filters: next, relaxed: key };
    }
  }
  return null;
}

export function hasFilters(filters: QueryFilters): boolean {
  return RELAXATION_ORDER.some((key) => filters[key] !== undefined);
}
