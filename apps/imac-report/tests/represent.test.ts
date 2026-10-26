import { describe, expect, it } from "vitest";
import { normaliseTable } from "@/lib/extract/tables";
import { linkFootnotes } from "@/lib/extract/footnotes";
import { numericMatch, numberUnitPairs, statesEstimateAsExact } from "@/lib/eval/qa/numeric";
import { expandQuery, phasesIn } from "@/lib/normalize/glossary";
import { normaliseForSearch, unitsIn } from "@/lib/normalize/units";
import { buildFlatChunks, buildTypedChunks, buildVariantVocab } from "@/lib/represent/build";
import { fixtureElements } from "./fixtures";

const elements = fixtureElements().map((e) => (e.type === "table" ? normaliseTable(e) : e));
const { links } = linkFootnotes(elements, []);
const vocab = buildVariantVocab(elements);
const chunks = buildTypedChunks(elements, links, vocab);

describe("representations", () => {
  it("builds the variant vocabulary from table headers", () => {
    expect(vocab).toEqual(["iMac 24-inch (four ports)", "iMac 24-inch (two ports)"]);
  });

  it("turns each table row into a sentence with units and variants", () => {
    const sleep = chunks.find((c) => c.kind === "table_row" && c.content.includes("for Sleep"))!;
    expect(sleep.content).toBe('Table "Energy consumption" (page 2): for Sleep, iMac 24-inch (two ports) is 0.9 W; iMac 24-inch (four ports) is 1.0 W.');
    expect(sleep.variants.sort()).toEqual(vocab.slice().sort());
    expect(sleep.ftsText).toContain("0.9 w");
  });

  it("makes chart facts only from labelled values", () => {
    const facts = chunks.filter((c) => c.kind === "chart_fact").map((c) => c.content);
    expect(facts.some((f) => f.includes("Production: 70%"))).toBe(true);
    expect(facts.some((f) => f.includes("12%"))).toBe(false);
    expect(chunks.find((c) => c.kind === "chart_summary")!.content).toContain("approximate visual readings");
  });

  it("appends linked footnotes and records who references a footnote", () => {
    const text = chunks.find((c) => c.kind === "text")!;
    expect(text.content).toContain("Notes: [1] Use phase assumes");
    const footnote = chunks.find((c) => c.kind === "footnote")!;
    expect(footnote.content).toContain("Referenced by:");
    expect(text.embedText.split("\n")[0]).toBe("Apple iMac Environmental Report | Page 1 | Type: text");
  });

  it("flat chunks cover each page without elements", () => {
    const flat = buildFlatChunks(elements);
    expect(flat.every((c) => c.kind === "flat" && c.elementKey === null)).toBe(true);
    expect(new Set(flat.map((c) => c.page))).toEqual(new Set([1, 2]));
  });
});

describe("normalisation", () => {
  it("canonicalises units for search", () => {
    expect(normaliseForSearch("410 kg CO₂e, 23 kilowatt-hours, 70%")).toBe("410 kg co2e , 23 kwh , 70 percent");
    expect(unitsIn("410 kilograms CO2e")).toEqual(["co2e", "kg"]);
    expect(phasesIn("Production and end-of-life recycling")).toEqual(["production", "end_of_life"]);
  });

  it("expands glossary terms into OR groups in place", () => {
    expect(expandQuery("carbon footprint of iMac")).toBe('"carbon footprint" OR "life cycle carbon emissions" OR "greenhouse gas emissions" OR co2e OR emissions of iMac');
    expect(expandQuery("weight of the stand")).toBe("weight of the stand");
  });
});

describe("numeric checks", () => {
  it("extracts number+unit pairs and matches expected values", () => {
    expect(numberUnitPairs("It is 410 kg CO₂e [1] and 70% [2].")).toEqual([
      { value: 410, unit: "kg co2e" },
      { value: 70, unit: "percent" },
    ]);
    expect(numericMatch("Production is 70% [1].", [{ value: "70", unit: "%" }])).toBe(1);
    expect(numericMatch("Production is 71% [1].", [{ value: "70", unit: "%" }])).toBe(0);
  });

  it("flags an estimated value stated as exact, not a hedged one", () => {
    expect(statesEstimateAsExact("Packaging is 12% of emissions.", ["~12%"])).toBe(true);
    expect(statesEstimateAsExact("Packaging is approximately 12%, read from the chart.", ["~12%"])).toBe(false);
  });
});
