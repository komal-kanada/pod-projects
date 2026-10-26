import type { ChartElement } from "../../extract/charts";
import type { TableElement } from "../../extract/tables";
import { elementMarkdown } from "../../represent/markdown";
import type { Element, FootnoteLink } from "../../types";
import type { GroundTruth } from "./ground-truth";

/**
 * Scores one strategy's elements against the ground truth (10 §1 metrics).
 * Pure functions: the inputs are elements and labels, nothing else. Overrides
 * are never applied before scoring, so the comparison stays honest.
 */
export function norm(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\^\S+/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[₂]/g, "2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function words(text: string): Set<string> {
  return new Set(norm(text).split(/[^\p{L}\p{N}%.]+/u).filter(Boolean));
}

/** Word-overlap similarity (Dice), 0–1. */
export function similarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (x.size === 0 && y.size === 0) return 1;
  let both = 0;
  for (const w of x) if (y.has(w)) both += 1;
  return (2 * both) / (x.size + y.size || 1);
}

export interface Diff {
  kind: "table" | "chart" | "footnote" | "coverage";
  page: number;
  what: string;
  expected: string;
  got: string;
}

export interface ExtractionScore {
  tableDetection: number | null;
  cellAccuracy: number | null;
  tableStructure: number | null;
  chartDetection: number | null;
  chartValueAccuracy: number | null;
  chartFalseLabelled: number;
  footnoteTextAccuracy: number | null;
  footnoteLinkAccuracy: number | null;
  factCoverage: number | null;
  diffs: Diff[];
}

function bestMatch<T extends Element>(candidates: T[], page: number, title: string | null, fallback: (c: T) => number): T | undefined {
  const onPage = candidates.filter((c) => c.page === page);
  if (onPage.length === 0) return undefined;
  const scored = onPage.map((c) => {
    const cTitle = "title" in c && c.title ? c.title : "";
    return { c, s: title && cTitle ? similarity(title, cTitle) : fallback(c) };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored[0].s >= 0.5 ? scored[0].c : undefined;
}

export function scoreExtraction(elements: Element[], links: FootnoteLink[], gt: GroundTruth): ExtractionScore {
  const diffs: Diff[] = [];
  const tables = elements.filter((e): e is TableElement => e.type === "table");
  const charts = elements.filter((e): e is ChartElement => e.type === "chart");
  const footnotes = elements.filter((e): e is Extract<Element, { type: "footnote" }> => e.type === "footnote");
  const ratio = (n: number, d: number) => (d === 0 ? null : n / d);

  // Tables: detection, cells (rows aligned by their first cell), structure.
  let tablesFound = 0;
  let cellsRight = 0;
  let cellsTotal = 0;
  let sameShape = 0;
  for (const truth of gt.tables) {
    const truthCells = [...truth.columns, ...truth.rows.flat()].join(" ");
    const match = bestMatch(tables, truth.page, truth.title, (t) => similarity(truthCells, [...t.columns, ...t.rows.flat()].join(" ")));
    if (!match) {
      diffs.push({ kind: "table", page: truth.page, what: "missing table", expected: truth.title ?? "(untitled)", got: "—" });
      cellsTotal += truth.rows.flat().length;
      continue;
    }
    tablesFound += 1;
    if (match.rows.length === truth.rows.length && match.columns.length === truth.columns.length) sameShape += 1;
    for (const row of truth.rows) {
      const got = match.rows.find((r) => norm(r[0] ?? "") === norm(row[0] ?? "")) ?? [];
      row.forEach((value, i) => {
        cellsTotal += 1;
        if (norm(got[i] ?? "") === norm(value)) cellsRight += 1;
        else diffs.push({ kind: "table", page: truth.page, what: `${truth.title ?? "table"} · ${row[0]} · ${truth.columns[i] ?? `col ${i + 1}`}`, expected: value, got: got[i] ?? "—" });
      });
    }
  }

  // Charts: detection and labelled values; anything "labelled" that isn't printed is a false label.
  let chartsFound = 0;
  let pointsRight = 0;
  let pointsTotal = 0;
  let falseLabelled = 0;
  for (const truth of gt.charts) {
    const match = bestMatch(charts, truth.page, truth.title, (c) => similarity(truth.points.map((p) => p.label).join(" "), c.series.flatMap((s) => s.points.map((p) => p.label)).join(" ")));
    pointsTotal += truth.points.length;
    if (!match) {
      diffs.push({ kind: "chart", page: truth.page, what: "missing chart", expected: truth.title ?? "(untitled)", got: "—" });
      continue;
    }
    chartsFound += 1;
    const got = match.series.flatMap((s) => s.points.map((p) => ({ ...p, series: s.name })));
    for (const point of truth.points) {
      const hit = got.find((p) => norm(p.label) === norm(point.label) && (!point.series || norm(p.series) === norm(point.series) || match.series.length === 1));
      if (hit && hit.valueSource === "labelled" && norm(hit.valueText) === norm(point.valueText)) pointsRight += 1;
      else diffs.push({ kind: "chart", page: truth.page, what: `${truth.title ?? "chart"} · ${point.series ? `${point.series} · ` : ""}${point.label}`, expected: point.valueText, got: hit ? `${hit.valueText} (${hit.valueSource})` : "—" });
    }
    for (const p of got.filter((p) => p.valueSource === "labelled")) {
      const printed = truth.points.some((t) => norm(t.label) === norm(p.label) && norm(t.valueText) === norm(p.valueText));
      if (!printed && !truth.points.some((t) => norm(t.label) === norm(p.label))) falseLabelled += 1;
    }
  }

  // Footnotes: text and links (GT link = element on that page containing the snippet → that marker).
  let footnotesRight = 0;
  let linksRight = 0;
  let linksTotal = 0;
  const byKey = new Map(elements.map((e) => [e.key, e]));
  for (const truth of gt.footnotes) {
    const match = footnotes.find((f) => f.marker === truth.marker && (truth.page === undefined || f.page === truth.page) && similarity(f.text, truth.text) >= 0.85);
    if (match) footnotesRight += 1;
    else diffs.push({ kind: "footnote", page: truth.page ?? 0, what: `footnote ${truth.marker}`, expected: truth.text, got: footnotes.find((f) => f.marker === truth.marker)?.text ?? "—" });
    for (const ref of truth.referencedBy) {
      linksTotal += 1;
      const ok = links.some((l) => {
        const element = byKey.get(l.elementKey);
        return l.marker === truth.marker && element?.page === ref.page && norm(elementMarkdown(element)).includes(norm(ref.snippet));
      });
      if (ok) linksRight += 1;
      else diffs.push({ kind: "footnote", page: ref.page, what: `link to footnote ${truth.marker}`, expected: ref.snippet, got: "not linked" });
    }
  }

  // Coverage: each important fact appears somewhere in the page's extracted content.
  let factsRight = 0;
  let factsTotal = 0;
  for (const { page, facts } of gt.coverage) {
    const content = norm(elements.filter((e) => e.page === page).map(elementMarkdown).join(" \n "));
    for (const fact of facts) {
      factsTotal += 1;
      if (content.includes(norm(fact))) factsRight += 1;
      else diffs.push({ kind: "coverage", page, what: "fact not found", expected: fact, got: "—" });
    }
  }

  return {
    tableDetection: ratio(tablesFound, gt.tables.length),
    cellAccuracy: ratio(cellsRight, cellsTotal),
    tableStructure: ratio(sameShape, tablesFound),
    chartDetection: ratio(chartsFound, gt.charts.length),
    chartValueAccuracy: ratio(pointsRight, pointsTotal),
    chartFalseLabelled: falseLabelled,
    footnoteTextAccuracy: ratio(footnotesRight, gt.footnotes.length),
    footnoteLinkAccuracy: ratio(linksRight, linksTotal),
    factCoverage: ratio(factsRight, factsTotal),
    diffs,
  };
}
