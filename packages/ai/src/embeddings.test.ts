import { describe, expect, it } from "vitest";
import { normalise } from "./embeddings";
import { createFakeEmbedder } from "./fake";

const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);

describe("normalise", () => {
  it("returns a unit vector", () => {
    const v = normalise([3, 4]);
    expect(v[0]).toBeCloseTo(0.6);
    expect(Math.hypot(...v)).toBeCloseTo(1);
    expect(normalise([0, 0])).toEqual([0, 0]);
  });
});

describe("fake embedder", () => {
  it("is deterministic, unit length and lexically sensible", async () => {
    const embedder = createFakeEmbedder(256);
    const [revenue, revenue2, printing] = await embedder.embedDocuments([
      "Total revenue for fiscal year 2023",
      "Revenue in fiscal year 2023 totalled",
      "Passport printing and secure credentials",
    ]);
    expect(Math.hypot(...revenue)).toBeCloseTo(1);
    expect(await embedder.embedQuery("Total revenue for fiscal year 2023")).toEqual(revenue);
    expect(dot(revenue, revenue2)).toBeGreaterThan(dot(revenue, printing));
  });
});
