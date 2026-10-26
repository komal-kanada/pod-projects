import { describe, expect, it } from "vitest";
import { joinPages, parsePageBlocks } from "@/lib/parse/blocks";
import { pageFidelity } from "@/lib/parse/fidelity";
import { splitPages } from "@/lib/parse/page-markdown";
import { buildTree, flattenTree, type OutlineItem } from "@/lib/structure/tree";
import { MARKDOWN_PAGES, fixtureReport } from "./fixtures";

describe("parsePageBlocks", () => {
  const blocks = parsePageBlocks(MARKDOWN_PAGES[1], 2);

  it("types headings, paragraphs and tables, with captions and notes", () => {
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "heading", "paragraph", "table"]);
    const table = blocks[3];
    if (table.kind !== "table") throw new Error("expected table");
    expect(table.caption).toBe("Table 1.1 Real GDP growth");
    expect(table.header).toEqual(["Region", "2023", "2024e", "2025f", "2026f"]);
    expect(table.rowLabels).toEqual(["World", "South Asia", "Sub-Saharan Africa"]);
    expect(table.notes).toMatch(/f = forecast/);
  });

  it("attaches footnotes to the block with their marker", () => {
    const page = parsePageBlocks(MARKDOWN_PAGES[2], 3);
    const para = page.find((b) => b.kind === "paragraph");
    expect(para && "footnotes" in para ? para.footnotes : []).toEqual([{ n: "1", text: expect.stringMatching(/tightening/) }]);
    expect(page.some((b) => b.kind === "footnote")).toBe(false);
  });

  it("reads figures and boxes", () => {
    expect(parsePageBlocks(MARKDOWN_PAGES[4], 5).find((b) => b.kind === "figure")).toMatchObject({ title: "Figure 2.5.1 South Asia growth" });
    const box = parsePageBlocks(MARKDOWN_PAGES[3], 4).find((b) => b.kind === "box");
    expect(box).toMatchObject({ title: "Box 1.1 Trade policy uncertainty" });
  });
});

describe("joinPages", () => {
  it("joins a paragraph that continues onto the next page", () => {
    const joined = joinPages([parsePageBlocks(MARKDOWN_PAGES[2], 3), parsePageBlocks(MARKDOWN_PAGES[3], 4)]);
    const para = joined.find((b) => b.kind === "paragraph" && b.text.includes("Climate-related"));
    expect(para).toMatchObject({ pageEnd: 4 });
    expect(para && "text" in para ? para.text : "").toMatch(/the risks continuing into next year/);
  });

  it("merges a table whose header repeats on the next page", () => {
    const a = "| A | B |\n| --- | --- |\n| x | 1 |";
    const b = "| A | B |\n| --- | --- |\n| y | 2 |";
    const joined = joinPages([parsePageBlocks(a, 1), parsePageBlocks(b, 2)]);
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({ kind: "table", rows: 2, pageEnd: 2 });
  });
});

describe("buildTree", () => {
  const parsed = fixtureReport();
  const blocks = joinPages(parsed.markdownPages.map((md, i) => parsePageBlocks(md!, i + 1)));
  const tree = buildTree(blocks, parsed.outline, parsed.pageCount);
  const nodes = flattenTree(tree);
  const byTitle = (title: string) => nodes.find((n) => n.title === title)!;

  it("uses the outline as the skeleton and nests headings under it", () => {
    expect(tree.children.map((c) => c.title)).toEqual(
      expect.arrayContaining(["Chapter 1 Global Outlook", "Chapter 2 Regional Outlooks", "References"]),
    );
    expect(byTitle("Outlook").path).toEqual(["Chapter 2 Regional Outlooks", "South Asia", "Outlook"]);
    expect(byTitle("Risks to the outlook").path[0]).toBe("Chapter 1 Global Outlook");
  });

  it("inherits regions from section titles and excludes references", () => {
    const outlooks = nodes.filter((n) => n.title === "Outlook");
    expect(outlooks.map((n) => n.regions)).toEqual([["SAR"], ["SSA"]]);
    expect(byTitle("References").retrievable).toBe(false);
  });

  it("makes boxes child sections and computes page ranges", () => {
    expect(byTitle("Box 1.1 Trade policy uncertainty").kind).toBe("box");
    expect(byTitle("Chapter 1 Global Outlook").pageStart).toBe(2);
    expect(byTitle("Chapter 1 Global Outlook").pageEnd).toBe(4);
  });
});

describe("buildTree with a hand-checked outline", () => {
  // Text-layer style: one paragraph per page, no headings or box blocks.
  const pages = ["Foreword text.", "Chapter 1 opens.", "Box 1.1 starts.", "Box 1.1 ends.", "Back in the chapter.", "South Asia grew."];
  const blocks = joinPages(pages.map((text, i) => [{ kind: "paragraph" as const, text, page: i + 1 }]));
  const outline: OutlineItem[] = [
    { title: "Foreword", pageNumber: 1, level: 1, kind: "front_matter" },
    { title: "Chapter 1. Global Outlook", pageNumber: 2, level: 1 },
    { title: "Box 1.1 Trade policy uncertainty", pageNumber: 3, level: 2, kind: "box", pageEnd: 4 },
    { title: "Chapter 2. Regional Outlooks", pageNumber: 6, level: 1 },
    { title: "South Asia", pageNumber: 6, level: 2 },
  ];
  const nodes = flattenTree(buildTree(blocks, outline, pages.length));
  const byTitle = (title: string) => nodes.find((n) => n.title === title)!;

  it("uses the outline's kinds and closes a box after its last page", () => {
    expect(byTitle("Foreword").kind).toBe("front_matter");
    const box = byTitle("Box 1.1 Trade policy uncertainty");
    expect(box).toMatchObject({ kind: "box", pageStart: 3, pageEnd: 4 });
    expect(byTitle("Chapter 1. Global Outlook").blocks.map((b) => b.page)).toEqual([2, 5]);
    expect(byTitle("South Asia")).toMatchObject({ path: ["Chapter 2. Regional Outlooks", "South Asia"], regions: ["SAR"] });
  });

  it("drops a box entry when the markdown already has the box", () => {
    const parsed = fixtureReport();
    const md = joinPages(parsed.markdownPages.map((page, i) => parsePageBlocks(page!, i + 1)));
    const withBox: OutlineItem[] = [...parsed.outline, { title: "Box 1.1 Trade policy uncertainty", pageNumber: 4, level: 2, kind: "box", pageEnd: 4 }];
    const boxes = flattenTree(buildTree(md, withBox, parsed.pageCount)).filter((n) => n.kind === "box");
    expect(boxes).toHaveLength(1);
  });

  it("doesn't run a paragraph on into a page where a section starts", () => {
    const split = joinPages([[{ kind: "paragraph", text: "no full stop", page: 1 }], [{ kind: "paragraph", text: "next", page: 2 }]], new Set([2]));
    expect(split).toHaveLength(2);
  });
});

describe("fidelity + page split", () => {
  it("flags numbers that aren't in the text layer", () => {
    const thresholds = { minNumericPrecision: 0.98, minCoverage: 0.9 };
    expect(pageFidelity(1, "Growth was 2.7 percent", "Growth was 2.7 percent", thresholds).ok).toBe(true);
    const bad = pageFidelity(1, "Growth was 2.9 percent", "Growth was 2.7 percent", thresholds);
    expect(bad.ok).toBe(false);
    expect(bad.unmatchedNumbers).toEqual(["2.9"]);
  });

  it("splits model output on page markers", () => {
    const pages = splitPages("<<<PAGE 3>>>\nA\n<<<PAGE 4>>>\n(no text)\n<<<PAGE 9>>>\nX", 3, 4);
    expect([...pages]).toEqual([[3, "A"], [4, ""]]);
  });
});
