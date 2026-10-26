/**
 * End to end, offline: fixture elements → X0:flat and X2:typed runs → presets
 * M0, M2, M3, M4 → streamed answer, on real Postgres (PGlite + pgvector) with
 * the real migrations. Fake embeddings, stub Gemini.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { createFakeEmbedder } from "@pod/ai/fake";
import { createDb, type Sql } from "@pod/db";
import { migrate } from "@pod/db/migrate";
import { startTestDatabase } from "@pod/db/test-server";
import { getActiveRuns } from "@/lib/db/runs";
import { elementDetail, listPages } from "@/lib/db/read";
import { linkFootnotes } from "@/lib/extract/footnotes";
import { normaliseTable } from "@/lib/extract/tables";
import type { ExtractionResult } from "@/lib/extract/run";
import { ingest } from "@/lib/ingest/pipeline";
import { answerOnce } from "@/lib/rag/answer";
import { runRetrieval } from "@/lib/retrieval/pipeline";
import type { Element, RenderedPage } from "@/lib/types";
import { fixtureElements, stubGemini } from "./fixtures";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let sql: Sql;
const embedder = createFakeEmbedder(768);
const CROP = "/report/crops/test-pipeline-table.png";

const pages: RenderedPage[] = [1, 2].map((page) => ({ page, imagePath: "unused.png", width: 1000, height: 1300, imageHash: `h${page}`, lines: [], text: "", bodySize: 10 }));

function extraction(strategy: "X0" | "X2", elements: Element[]): ExtractionResult {
  const normalised = elements.map((e) => (e.type === "table" ? normaliseTable(e) : e));
  const { links, unresolved } = linkFootnotes(normalised, []);
  return { strategy, elements: normalised, links, unresolved, perPage: [], overridesApplied: [] };
}

beforeAll(async () => {
  db = await startTestDatabase("imac");
  sql = createDb(db.url, { max: 1 });
  await migrate(sql, { schema: "imac", directory: path.resolve("supabase/migrations"), log: () => {} });
  const x0 = fixtureElements("X0").filter((e) => e.type === "text" || e.type === "heading" || e.type === "footnote");
  await ingest({ sql, embedder }, { representation: "flat", extraction: extraction("X0", x0), pages, documentSha: "sha", activate: true, publish: false, log: () => {} });
  await ingest({ sql, embedder }, { representation: "typed", extraction: extraction("X2", fixtureElements("X2")), pages, documentSha: "sha", activate: true, publish: false, log: () => {} });
  // A crop for the table, so M4 has an image to attach.
  await sql`update imac.elements set crop_path = ${CROP} where type = 'table'`;
  await mkdir(path.join("public", "report", "crops"), { recursive: true });
  await writeFile(path.join("public", CROP), await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).png().toBuffer());
});

afterAll(async () => {
  await rm(path.join("public", CROP), { force: true });
  await sql?.end();
  await db?.stop();
});

describe("imac pipeline on Postgres", () => {
  it("stores runs, pages, elements and footnote links", async () => {
    const runs = await getActiveRuns(sql);
    expect(Object.keys(runs).sort()).toEqual(["X0:flat", "X2:typed"]);
    const stored = await listPages(sql, runs["X2:typed"]!.id);
    expect(stored.map((p) => p.elements.length)).toEqual([4, 3]);
    const text = stored[0].elements.find((e) => e.type === "text")!;
    const detail = await elementDetail(sql, text.id);
    expect(detail?.footnotes.map((f) => f.marker)).toEqual(["1"]);
    expect(detail?.chunks.length).toBeGreaterThan(0);
  });

  it("M0 retrieves flat page chunks", async () => {
    const outcome = await runRetrieval({ sql, embedder, gemini: stubGemini() }, await getActiveRuns(sql), "carbon footprint of iMac", "M0");
    expect(outcome.sources.every((s) => s.type === "flat")).toBe(true);
  });

  it("M2 expands a row hit to the whole table and marks the row", async () => {
    const outcome = await runRetrieval({ sql, embedder, gemini: stubGemini() }, await getActiveRuns(sql), "Energy consumption Sleep iMac 24-inch power", "M2");
    const table = outcome.sources.find((s) => s.type === "table")!;
    expect(table).toBeDefined();
    expect(table.text).toContain("| Idle |");
    expect(table.hitRows).toContain(1);
    expect(table.text).toMatch(/\| Sleep \|.*← matched/);
  });

  it("a footnote travels with the element that references it", async () => {
    const outcome = await runRetrieval({ sql, embedder, gemini: stubGemini() }, await getActiveRuns(sql), "use phase assumes four years first owner", "M2");
    const types = outcome.sources.map((s) => s.type);
    expect(types).toContain("footnote");
    const text = outcome.sources.find((s) => s.type === "text");
    expect(text?.footnotes.map((f) => f.marker)).toEqual(["1"]);
  });

  it("M3 validates variants against the report's vocabulary and boosts tables", async () => {
    const outcome = await runRetrieval({ sql, embedder, gemini: stubGemini() }, await getActiveRuns(sql), "How much power does the four-port iMac use in sleep?", "M3");
    expect(outcome.analysis?.variants).toEqual(["iMac 24-inch (four ports)"]);
    expect(outcome.analysis?.dropped).toEqual(["variant:iMac 99 (made up)"]);
    expect(outcome.trace.find((t) => t.stage === "search")?.summary).toContain("boost table_row");
    expect(outcome.sources[0].type).toBe("table");
  });

  it("M4 attaches the table crop as an image and answers with citations", async () => {
    const seen = { prompts: [] as unknown[] };
    const result = await answerOnce({ sql, embedder, gemini: stubGemini(seen) }, await getActiveRuns(sql), "Sleep power of the four-port iMac?", { preset: "M4", source: "eval" });
    expect(result.error).toBeNull();
    expect(result.outcome?.images.length).toBe(1);
    const parts = seen.prompts[0] as { text?: string; inlineData?: unknown }[];
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.some((p) => p.text?.startsWith("Image for source"))).toBe(true);
    expect(parts.some((p) => p.inlineData)).toBe(true);
    expect(result.citations).toEqual([1]);
  });

  it("M5 says what it needs", async () => {
    await expect(runRetrieval({ sql, embedder, gemini: stubGemini() }, await getActiveRuns(sql), "anything", "M5")).rejects.toThrow(/multimodal embedding/);
  });
});
