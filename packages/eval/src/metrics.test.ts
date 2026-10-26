import { describe, expect, it } from "vitest";
import { hitAtK, mean, ndcgAtK, overlaps, percentile, recallAtK, reciprocalRank } from "./metrics";

describe("retrieval metrics", () => {
  it("Hit@k and MRR", () => {
    const hits = [false, false, true, false];
    expect(hitAtK(hits, 2)).toBe(0);
    expect(hitAtK(hits, 3)).toBe(1);
    expect(reciprocalRank(hits)).toBeCloseTo(1 / 3);
    expect(reciprocalRank([false])).toBe(0);
  });

  it("Recall@k over covered targets", () => {
    expect(recallAtK([[14, 15], [3], [22]], [14, 22, 40], 2)).toBeCloseTo(1 / 3);
    expect(recallAtK([[14, 15], [3], [22]], [14, 22, 40], 3)).toBeCloseTo(2 / 3);
  });

  it("nDCG is 1 for an ideal ranking and lower otherwise", () => {
    expect(ndcgAtK([2, 1, 0], 10)).toBeCloseTo(1);
    expect(ndcgAtK([0, 1, 2], 10)).toBeLessThan(1);
    expect(ndcgAtK([0, 0], 10)).toBe(0);
  });

  it("mean and percentile ignore non-finite values", () => {
    expect(mean([1, 2, Number.NaN, 3])).toBe(2);
    expect(mean([])).toBeNull();
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
  });

  it("page overlap", () => {
    expect(overlaps(14, 15, [15, 30])).toBe(true);
    expect(overlaps(14, 15, [16])).toBe(false);
  });
});
