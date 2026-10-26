import { describe, expect, it } from "vitest";
import { chartAsMarkdown, normaliseChart, normalisePoint, type ChartElement } from "@/lib/extract/charts";
import { linkFootnotes } from "@/lib/extract/footnotes";
import { fromRaw } from "@/lib/extract/from-raw";
import { mergeMultiPageTables, normaliseTable, type TableElement } from "@/lib/extract/tables";
import { scoreExtraction } from "@/lib/eval/extraction/score";
import { fixtureElements } from "./fixtures";

describe("tables", () => {
  it("pads ragged rows, detects the unit and renders markdown", () => {
    const t = normaliseTable({ key: "k", page: 1, order: 0, bbox: null, footnoteRefs: [], type: "table", title: "Energy use (kWh)", columns: ["Mode", "Value"], rows: [["Off", " 0.3 "], ["Sleep"]], rowHeaderCols: 1 });
    expect(t.rows).toEqual([["Off", "0.3"], ["Sleep", ""]]);
    expect(t.unit).toBe("kWh");
    expect(t.markdown.split("\n")[0]).toBe("| Mode | Value |");
  });

  it("merges a table continued on the next page", () => {
    const a = normaliseTable({ key: "a", page: 1, order: 5, bbox: null, footnoteRefs: [], type: "table", columns: ["A", "B"], rows: [["x", "1"]], rowHeaderCols: 1 });
    const b = normaliseTable({ key: "b", page: 2, order: 0, bbox: null, footnoteRefs: [], type: "table", columns: ["A", "B"], rows: [["y", "2"]], rowHeaderCols: 1 });
    const merged = mergeMultiPageTables([a, b]);
    expect(merged).toHaveLength(1);
    expect((merged[0] as TableElement).rows).toEqual([["x", "1"], ["y", "2"]]);
  });
});

describe("charts", () => {
  it("treats ~ as estimated and <1% as non-numeric", () => {
    expect(normalisePoint({ label: "a", valueText: "~12%", valueSource: "labelled" })).toMatchObject({ valueSource: "estimated", value: 12 });
    expect(normalisePoint({ label: "b", valueText: "<1%", valueSource: "labelled" })).toMatchObject({ value: null, valueSource: "labelled" });
  });

  it("flags stacked shares that don't sum to 100", () => {
    const chart = fixtureElements()[2] as ChartElement;
    const bad = normaliseChart({ ...chart, series: [{ name: "s", points: [{ label: "a", value: 50, valueText: "50%", valueSource: "labelled" }, { label: "b", value: 30, valueText: "30%", valueSource: "labelled" }] }] });
    expect(bad.fidelity?.flags[0]).toMatch(/sum to 80/);
  });

  it("renders chart data with labelled/estimated marked", () => {
    const md = chartAsMarkdown(fixtureElements()[2] as ChartElement);
    expect(md).toContain("| Production | 70% (labelled) |");
    expect(md).toContain("~12% (estimated, not printed)");
  });

  it("converts model JSON and clamps boxes", () => {
    const e = fromRaw({ type: "text", text: "Hello", box_2d: [-5, 10, 1200, 500] }, { key: "k", page: 1, order: 0 });
    expect(e).toMatchObject({ type: "text", bbox: [0, 10, 1000, 500] });
    expect(fromRaw({ type: "table", rows: [] }, { key: "k", page: 1, order: 0 })).toBeNull();
  });
});

describe("footnote linking", () => {
  it("links markers to same-page footnotes and reports unresolved ones", () => {
    const elements = fixtureElements();
    elements.push({ key: "X2-p02-e09", page: 2, order: 9, bbox: null, footnoteRefs: ["7"], type: "text", text: "Orphan^7" });
    const { links, unresolved } = linkFootnotes(elements, []);
    expect(links).toEqual([{ elementKey: "X2-p01-e01", footnoteKey: "X2-p01-e03", marker: "1" }]);
    expect(unresolved).toEqual([{ elementKey: "X2-p02-e09", marker: "7" }]);
  });
});

describe("extraction scoring", () => {
  it("scores cells, chart values, false labels, links and coverage against ground truth", () => {
    const elements = fixtureElements().map((e) => (e.type === "table" ? normaliseTable(e) : e));
    const { links } = linkFootnotes(elements, []);
    const score = scoreExtraction(elements, links, {
      tables: [{ page: 2, title: "Energy consumption", columns: ["Mode", "iMac 24-inch (two ports)", "iMac 24-inch (four ports)"], rows: [["Sleep", "0.9", "1.1"]] }],
      charts: [{ page: 1, title: "Life cycle carbon emissions", points: [{ series: "", label: "Production", valueText: "70%" }, { series: "", label: "Transport", valueText: "6%" }] }],
      footnotes: [{ marker: "1", page: 1, text: "Use phase assumes four years of use by the first owner.", referencedBy: [{ page: 1, snippet: "410 kg" }] }],
      coverage: [{ page: 2, facts: ["40%", "less energy than the previous generation", "not on the page"] }],
    });
    expect(score.tableDetection).toBe(1);
    expect(score.cellAccuracy).toBeCloseTo(2 / 3);
    expect(score.chartValueAccuracy).toBe(1);
    expect(score.chartFalseLabelled).toBe(2); // Use and End of life are labelled but not in this GT
    expect(score.footnoteTextAccuracy).toBe(1);
    expect(score.footnoteLinkAccuracy).toBe(1);
    expect(score.factCoverage).toBeCloseTo(2 / 3);
    expect(score.diffs.find((d) => d.kind === "table")).toMatchObject({ expected: "1.1", got: "1.0" });
  });
});
