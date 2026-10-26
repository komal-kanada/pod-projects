import { describe, expect, it } from "vitest";
import type { SectionChild } from "@/lib/db/chunks";
import { assembleContext, type RankedCandidate, type SectionInfo } from "@/lib/retrieval/context";
import { fuseLists, selectWithQuotas } from "@/lib/retrieval/fusion";
import type { Candidate } from "@/lib/types";

function candidate(id: string, over: Partial<Candidate> = {}): Candidate {
  return {
    chunkId: id, sectionId: "s1", contentType: "text", title: null, content: `content ${id}`, sectionPath: ["Ch 1", "Sec"],
    chapter: "Ch 1", pageStart: 1, pageEnd: 1, pageLabelStart: "1", pageLabelEnd: "1", regions: [], countries: [], years: [],
    isForecast: false, tokenCount: 100, ordinalInSection: 0, similarity: 0.5, vectorRank: 1, keywordRank: null, score: 0.1, ...over,
  };
}

describe("fusion with quotas", () => {
  it("gives every sub-query its share of slots", () => {
    const a = ["a1", "a2", "a3", "a4", "a5"].map((id) => candidate(id));
    const b = ["b1", "b2"].map((id) => candidate(id));
    const fused = fuseLists([a, b]);
    const chosen = selectWithQuotas(fused, 4, 2);
    expect(chosen.map((c) => c.chunkId).sort()).toEqual(["a1", "a2", "b1", "b2"]);
  });
});

describe("assembleContext", () => {
  const kids = (section: string, n: number, tokens = 600): SectionChild[] =>
    Array.from({ length: n }, (_, i) => ({
      chunkId: `${section}-c${i}`, sectionId: section, ordinal: i, contentType: "text" as const, title: null,
      content: `${section} part ${i}`, tokenCount: tokens, pageStart: 10 + i, pageEnd: 10 + i, pageLabelStart: String(10 + i), pageLabelEnd: String(10 + i),
    }));
  const info = (id: string, ordinal: number, ownTokenCount: number, path = ["Ch 1", id]): SectionInfo => ({
    id, path, title: id, ordinal, ownText: `${id} whole text`, ownTokenCount, pageStart: 10, pageEnd: 20,
  });
  const ranked = (c: Candidate, score: number): RankedCandidate => ({ ...c, finalScore: score });

  it("expands a child to its whole small section and merges siblings", () => {
    const result = assembleContext({
      final: [ranked(candidate("small-c0", { sectionId: "small", ordinalInSection: 0 }), 0.9), ranked(candidate("small-c1", { sectionId: "small", ordinalInSection: 1 }), 0.5)],
      mode: "smallToBig",
      sections: new Map([["small", info("small", 1, 900)]]),
      children: new Map([["small", kids("small", 2, 450)]]),
      parentMaxTokens: 2000,
      budget: 12000,
    });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].text).toBe("small whole text");
    expect(result.sources[0].chunkIds.sort()).toEqual(["small-c0", "small-c1"]);
    expect(result.stats.merged).toBe(1);
  });

  it("uses a window inside a big section, grown around the hit", () => {
    const result = assembleContext({
      final: [ranked(candidate("big-c5", { sectionId: "big", ordinalInSection: 5 }), 0.9)],
      mode: "smallToBig",
      sections: new Map([["big", info("big", 1, 6000)]]),
      children: new Map([["big", kids("big", 10)]]),
      parentMaxTokens: 2000,
      budget: 12000,
    });
    expect(result.sources[0].text).toBe("big part 4\n\nbig part 5\n\nbig part 6");
    expect(result.sources[0].pageLabel).toBe("p. 14–16");
  });

  it("drops what doesn't fit the budget and orders by chapter then document order", () => {
    const result = assembleContext({
      final: [
        ranked(candidate("x", { sectionId: null, contentType: "table", content: "t".repeat(4000), sectionPath: ["Ch 2"], ordinalInSection: null }), 0.9),
        ranked(candidate("y", { sectionId: null, contentType: "table", content: "u".repeat(4000), sectionPath: ["Ch 2"], ordinalInSection: null }), 0.8),
        ranked(candidate("z", { sectionId: null, contentType: "figure", content: "late", sectionPath: ["Ch 1"], ordinalInSection: null, pageStart: 3 }), 0.7),
      ],
      mode: "smallToBig",
      sections: new Map(),
      children: new Map(),
      parentMaxTokens: 2000,
      budget: 1500,
    });
    expect(result.stats.dropped).toHaveLength(1);
    expect(result.sources.map((s) => s.chunkIds[0])).toEqual(["x", "z"]);
    expect(result.context).toMatch(/^<source id="1" section="Ch 2" pages="1" type="table"/);
  });

  it("raw mode keeps chunks as they are, in rank order", () => {
    const result = assembleContext({
      final: [ranked(candidate("a"), 0.9), ranked(candidate("b"), 0.8)],
      mode: "raw", sections: new Map(), children: new Map(), parentMaxTokens: 2000, budget: 12000,
    });
    expect(result.sources.map((s) => s.text)).toEqual(["content a", "content b"]);
  });
});
