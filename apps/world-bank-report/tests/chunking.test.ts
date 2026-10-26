import { describe, expect, it } from "vitest";
import { buildFlatChunks } from "@/lib/chunking/flat";
import { buildHierarchicalChunks } from "@/lib/chunking/hierarchical";
import { splitTable } from "@/lib/chunking/special-blocks";
import { buildDocument } from "@/lib/ingest/prepare";
import { extractMetadata, findCountries, findRegions, findYears, guessReportYear } from "@/lib/metadata/extract";
import { chapterInQuestion, matchChapter, relaxOnce, validateFilters } from "@/lib/metadata/validate";
import { fixtureReport } from "./fixtures";

describe("metadata", () => {
  it("finds regions and countries by name and alias, not by substring", () => {
    expect(findRegions("Growth in the Middle East and North Africa and MENA")).toEqual(["MNA"]);
    expect(findRegions("the sar was weak")).toEqual([]);
    expect(findCountries("Türkiye and Côte d'Ivoire; Nigeria")).toEqual(["CIV", "NGA", "TUR"]);
    // "Niger" must not match inside "Nigeria", nor "India" inside "Indian".
    expect(findCountries("Nigeria grew; the Indian Ocean")).toEqual(["NGA"]);
  });

  it("reads years, ranges, FY patterns and forecast markers", () => {
    expect(findYears("from 2023 to 2025f, FY24, and 2024–26")).toEqual([2023, 2024, 2025, 2026]);
    expect(extractMetadata("Growth 2026f", { reportYear: 2025 }).isForecast).toBe(true);
    expect(extractMetadata("Growth is projected to slow in 2026", { reportYear: 2025 }).isForecast).toBe(true);
    expect(extractMetadata("Growth was 2.6 percent in 2023", { reportYear: 2025 }).isForecast).toBe(false);
    expect(guessReportYear("Global Economic Prospects 2025 ... 2025 ... 2024")).toBe(2025);
  });

  it("validates LLM filters and relaxes in order", () => {
    const { filters, dropped } = validateFilters(
      { regions: ["SAR", "Atlantis"], countries: ["India", "XXX"], years: [2025, 3000], chapter: "chapter 1 global outlook" },
      { chapters: ["Chapter 1 Global Outlook"] },
    );
    expect(filters).toEqual({ regions: ["SAR"], countries: ["IND"], years: [2025], chapter: "Chapter 1 Global Outlook" });
    expect(dropped).toEqual(["region:Atlantis", "country:XXX", "year:3000"]);
    expect(relaxOnce({ years: [2025], regions: ["SAR"] })).toEqual({ filters: { regions: ["SAR"] }, relaxed: "years" });
  });

  const chapters = ["Foreword", "Executive Summary", "Chapter 1. Global Outlook", "Chapter 3. A Rising Challenge: Sovereign Debt"];

  it("resolves chapter references by number, word or title", () => {
    expect(matchChapter("Chapter 3", chapters)).toBe("Chapter 3. A Rising Challenge: Sovereign Debt");
    expect(matchChapter("ch. 3", chapters)).toBe("Chapter 3. A Rising Challenge: Sovereign Debt");
    expect(matchChapter("chapter three", chapters)).toBe("Chapter 3. A Rising Challenge: Sovereign Debt");
    expect(matchChapter("3", chapters)).toBe("Chapter 3. A Rising Challenge: Sovereign Debt");
    expect(matchChapter("Global Outlook", chapters)).toBe("Chapter 1. Global Outlook");
    expect(matchChapter("Chapter 9", chapters)).toBeNull();
  });

  it("finds a chapter the question names outright", () => {
    expect(chapterInQuestion("What does Chapter 3 say about sovereign debt?", chapters)).toBe("Chapter 3. A Rising Challenge: Sovereign Debt");
    expect(chapterInQuestion("What main risks does the executive summary highlight?", chapters)).toBe("Executive Summary");
    expect(chapterInQuestion("What is the growth outlook for South Asia?", chapters)).toBeNull();
  });
});

describe("hierarchical chunks", () => {
  const parsed = fixtureReport();
  const { tree } = buildDocument(parsed);
  const chunks = buildHierarchicalChunks(tree, { pageLabels: parsed.pageLabels, reportYear: 2025, parseSourceForPage: () => "gemini" });

  it("makes text, table, figure and box chunks and skips excluded sections", () => {
    const types = new Set(chunks.map((c) => c.contentType));
    expect(types).toEqual(new Set(["text", "table", "figure", "box"]));
    expect(chunks.some((c) => c.sectionPath[0] === "References")).toBe(false);
  });

  it("keeps a placeholder where a table was and embeds tables by description", () => {
    const text = chunks.find((c) => c.contentType === "text" && c.content.includes("[See Table 1.1"));
    expect(text).toBeDefined();
    const table = chunks.find((c) => c.contentType === "table")!;
    expect(table.content).toContain("| South Asia | 6.6 |");
    expect(table.embedText).toContain("Rows: World; South Asia; Sub-Saharan Africa");
    expect(table.embedText).not.toContain("| 6.6 |");
    expect(table.isForecast).toBe(true);
  });

  it("puts breadcrumb + inherited region in the embedded header", () => {
    const sa = chunks.find((c) => c.contentType === "text" && c.sectionPath.join("/") === "Chapter 2 Regional Outlooks/South Asia/Outlook")!;
    expect(sa.regions).toContain("SAR");
    expect(sa.embedText.split("\n")[0]).toBe("World Bank Economic Report › Chapter 2 Regional Outlooks › South Asia › Outlook");
    expect(sa.embedText).toContain("[Region: South Asia]");
  });

  it("carries footnotes inside the chunk", () => {
    expect(chunks.some((c) => c.content.includes("Notes: [1] Financial stress refers"))).toBe(true);
  });

  it("splits big tables by rows, repeating the header", () => {
    const rows = Array.from({ length: 40 }, (_, i) => `| Country ${i} | ${i}.0 | ${i}.5 |`).join("\n");
    const markdown = `| Country | 2024 | 2025f |\n| --- | --- | --- |\n${rows}`;
    const parts = splitTable({ kind: "table", markdown, header: [], rowLabels: [], rows: 40, page: 1 }, 600);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.startsWith("| Country | 2024 | 2025f |\n| --- |"))).toBe(true);
  });
});

describe("flat chunks", () => {
  it("packs pages with overlap and no section in the embedding", () => {
    const parsed = fixtureReport();
    const { tree } = buildDocument(parsed);
    const chunks = buildFlatChunks(parsed.textPages.map((text) => ({ text, source: "text_layer" as const })), { pageLabels: parsed.pageLabels, reportYear: 2025, tree });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.contentType === "flat")).toBe(true);
    expect(chunks[0].embedText.startsWith("World Bank Economic Report | Page")).toBe(true);
  });
});
