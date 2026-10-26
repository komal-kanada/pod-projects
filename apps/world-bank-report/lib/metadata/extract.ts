import { COUNTRY_MATCHERS, REGION_MATCHERS } from "./vocab";
import type { ChunkMetadata } from "../types";

/**
 * Deterministic metadata — no LLM, so it is cheap, reproducible and
 * testable (05 §4). Regions come from the section path (inherited) plus
 * mentions in the text; years from 4-digit years and FY patterns; forecasts
 * from table markers ("2026f") and forecast verbs near a future year.
 */

export function findRegions(text: string): string[] {
  return REGION_MATCHERS.filter(({ patterns }) => patterns.some((p) => p.test(text))).map(({ code }) => code);
}

export function findCountries(text: string): string[] {
  return COUNTRY_MATCHERS.filter(({ patterns }) => patterns.some((p) => p.test(text))).map(({ code }) => code);
}

const MIN_YEAR = 1990;
const MAX_YEAR = 2035;

export function findYears(text: string): number[] {
  const years = new Set<number>();
  for (const match of text.matchAll(/(?<!\d)(19|20)(\d{2})(?:[–-](\d{2,4}))?[efp]?(?!\d)/g)) {
    const year = Number(match[1] + match[2]);
    if (year >= MIN_YEAR && year <= MAX_YEAR) years.add(year);
    // Ranges such as 2024–26 or 2023-2025.
    if (match[3]) {
      const end = match[3].length === 2 ? Number(match[1] + match[3]) : Number(match[3]);
      if (end > year && end <= MAX_YEAR && end - year <= 15) {
        for (let y = year + 1; y <= end; y += 1) years.add(y);
      }
    }
  }
  for (const match of text.matchAll(/\bFY ?(\d{2})(?:\/(\d{2}))?\b/g)) {
    const year = 2000 + Number(match[1]);
    if (year >= MIN_YEAR && year <= MAX_YEAR) years.add(year);
  }
  return [...years].sort((a, b) => a - b);
}

const FORECAST_MARKER = /(?<!\d)(19|20)\d{2}[fe](?![a-z])/;
const FORECAST_WORDS = /\b(forecast|projected|projection|expected to|is set to|will (?:likely )?(?:rise|fall|slow|grow|edge|pick up|ease|remain))\b/i;

export function isForecast(text: string, years: number[], reportYear: number): boolean {
  if (FORECAST_MARKER.test(text)) return true;
  return FORECAST_WORDS.test(text) && years.some((year) => year >= reportYear);
}

export function extractMetadata(
  text: string,
  { inheritedRegions = [], reportYear }: { inheritedRegions?: string[]; reportYear: number },
): ChunkMetadata {
  const years = findYears(text);
  return {
    regions: [...new Set([...inheritedRegions, ...findRegions(text)])].sort(),
    countries: findCountries(text),
    years,
    isForecast: isForecast(text, years, reportYear),
  };
}

/**
 * The report's own year: the most common 4-digit year in its first pages
 * (cover, foreword). Anything at or after it counts as "future" for the
 * forecast heuristic.
 */
export function guessReportYear(firstPagesText: string, fallback = new Date().getFullYear()): number {
  const counts = new Map<number, number>();
  for (const match of firstPagesText.matchAll(/\b(20[1-3]\d)\b/g)) {
    const year = Number(match[1]);
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  const best = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return best ? best[0] : fallback;
}
