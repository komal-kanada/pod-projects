import { describe, expect, it } from "vitest";
import { configHash, stableStringify } from "./hash";
import { reciprocalRankFusion } from "./rrf";
import { createRateLimiter } from "./rate-limit";
import { mapWithConcurrency } from "./concurrency";
import { ndjsonResponse, readNdjson } from "./ndjson";

describe("hash", () => {
  it("is independent of key order", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    expect(configHash({ a: 1, b: 2 })).toBe(configHash({ b: 2, a: 1 }));
  });
});

describe("reciprocalRankFusion", () => {
  it("rewards items ranked well by both lists", () => {
    const fused = reciprocalRankFusion([["a", "b", "c"], ["b", "d"]], (x) => x);
    expect(fused[0].item).toBe("b");
    expect(fused[0].ranks).toEqual([2, 1]);
    expect(fused.map((entry) => entry.item)).toEqual(["b", "a", "d", "c"]);
  });
});

describe("rate limiter", () => {
  it("blocks after the limit within the window", () => {
    const check = createRateLimiter({ limit: 2, windowMs: 60_000 });
    expect(check("ip").ok).toBe(true);
    expect(check("ip").ok).toBe(true);
    expect(check("ip").ok).toBe(false);
    expect(check("other").ok).toBe(true);
  });
});

describe("mapWithConcurrency", () => {
  it("keeps order and limits parallelism", async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return n * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
  });

  it("starts nothing new after a failure", async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
        started.push(n);
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (n === 1) throw new Error("quota");
        return n;
      }),
    ).rejects.toThrow("quota");
    expect(started).toEqual([1, 2]);
  });
});

describe("ndjson", () => {
  it("round-trips events and reports errors as a final event", async () => {
    async function* events() {
      yield { type: "a" };
      yield { type: "b" };
      throw new Error("boom");
    }
    const response = ndjsonResponse(events(), {
      onError: (error) => ({ type: "error", message: (error as Error).message }),
    });
    const received = [];
    for await (const event of readNdjson(response)) received.push(event);
    expect(received).toEqual([{ type: "a" }, { type: "b" }, { type: "error", message: "boom" }]);
  });
});
