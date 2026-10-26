/**
 * End to end, offline: fixture report → all three run kinds → every preset
 * B0–B6 → streamed answer, on real Postgres (PGlite + pgvector over the wire)
 * with the real migrations. Embeddings are the deterministic fake; Gemini is a
 * stub with canned analysis/rerank/answer.
 */
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeEmbedder } from "@pod/ai/fake";
import { createDb, type Sql } from "@pod/db";
import { migrate } from "@pod/db/migrate";
import { startTestDatabase } from "@pod/db/test-server";
import { PRESET_IDS } from "@/lib/config";
import { getActiveRuns } from "@/lib/db/runs";
import { listSections } from "@/lib/db/sections";
import { ingest } from "@/lib/ingest/pipeline";
import { answerOnce } from "@/lib/rag/answer";
import { runRetrieval } from "@/lib/retrieval/pipeline";
import { fixtureReport, stubGemini } from "./fixtures";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let sql: Sql;
const embedder = createFakeEmbedder(768);
const gemini = stubGemini();

beforeAll(async () => {
  db = await startTestDatabase("worldbank");
  sql = createDb(db.url, { max: 1 });
  await migrate(sql, { schema: "worldbank", directory: path.resolve("supabase/migrations"), log: () => {} });
  const parsed = fixtureReport();
  for (const kind of ["flat:text", "flat:markdown", "hierarchical"] as const) {
    await ingest({ sql, embedder }, { kind, parsed, activate: true, log: () => {} });
  }
});

afterAll(async () => {
  await sql?.end();
  await db?.stop();
});

describe("world bank pipeline on Postgres", () => {
  it("has one active run per kind and a stored section tree", async () => {
    const runs = await getActiveRuns(sql);
    expect(Object.keys(runs).sort()).toEqual(["flat:markdown", "flat:text", "hierarchical"]);
    const sections = await listSections(sql, runs.hierarchical!.id);
    const outlook = sections.find((s) => s.path.join("/") === "Chapter 2 Regional Outlooks/South Asia/Outlook");
    expect(outlook?.regions).toEqual(["SAR"]);
    expect(outlook?.chunkCount).toBeGreaterThan(0);
  });

  it("re-ingesting is a no-op", async () => {
    const again = await ingest({ sql, embedder }, { kind: "hierarchical", parsed: fixtureReport(), log: () => {} });
    expect(again.skipped).toBe(true);
  });

  it("every preset retrieves and assembles context", async () => {
    const runs = await getActiveRuns(sql);
    for (const preset of PRESET_IDS.filter((p) => p !== "B6")) {
      const outcome = await runRetrieval({ sql, embedder, gemini }, runs, "What is the growth forecast for South Asia in 2025?", preset);
      expect(outcome.sources.length, preset).toBeGreaterThan(0);
      expect(outcome.trace.map((t) => t.stage), preset).toContain("context");
    }
  });

  it("hybrid + filters find the table row by keyword, small-to-big expands context", async () => {
    const runs = await getActiveRuns(sql);
    const outcome = await runRetrieval({ sql, embedder, gemini }, runs, "Sub-Saharan Africa 2025f growth table", "B3");
    expect(outcome.final.some((c) => c.contentType === "table")).toBe(true);
    expect(outcome.context).toMatch(/<source id="1" section="[^"]+" pages="[^"]+" type="/);
  });

  it("B5 analyses (dropping invalid filters), searches sub-queries with quotas and reranks", async () => {
    const runs = await getActiveRuns(sql);
    const outcome = await runRetrieval({ sql, embedder, gemini }, runs, "How does growth in South Asia compare with Sub-Saharan Africa in 2025?", "B5");
    expect(outcome.analysis?.filters).toEqual({ regions: ["SAR", "SSA"], years: [2025] });
    expect(outcome.analysis?.dropped).toEqual(["region:Atlantis"]);
    expect(outcome.trace.map((t) => t.stage)).toEqual(["analyze", "search", "rerank", "context"]);
    const regions = outcome.final.flatMap((c) => c.regions);
    expect(regions).toContain("SAR");
    expect(regions).toContain("SSA");
  });

  it("streams a cited answer and logs it", async () => {
    const runs = await getActiveRuns(sql);
    const result = await answerOnce({ sql, embedder, gemini }, runs, "Compare South Asia and Sub-Saharan Africa growth in 2025", { preset: "B5", source: "eval" });
    expect(result.error).toBeNull();
    expect(result.citations).toEqual([1, 2]);
    const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from worldbank.queries`;
    expect(count).toBe(1);
  });

  it("a preset whose run kind isn't ingested says so", async () => {
    const runs = await getActiveRuns(sql);
    await expect(runRetrieval({ sql, embedder, gemini }, { hierarchical: runs.hierarchical }, "x growth", "B0")).rejects.toThrow(/flat:text/);
  });
});
