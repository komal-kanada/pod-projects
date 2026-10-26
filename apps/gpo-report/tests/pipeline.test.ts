/**
 * End to end, offline: a generated PDF goes through the real pipeline into a
 * real Postgres (in-memory PGlite with pgvector, over the wire protocol),
 * using the real migrations and SQL functions. Embeddings are the
 * deterministic fake, so rankings are lexical but stable.
 */
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createFakeEmbedder } from "@pod/ai/fake";
import { createDb, type Sql } from "@pod/db";
import { migrate } from "@pod/db/migrate";
import { startTestDatabase } from "@pod/db/test-server";
import { activateRun, getActiveRun, listRuns } from "@/lib/db/runs";
import { listChunks } from "@/lib/db/chunks";
import { logQuery } from "@/lib/db/queries";
import { ingest } from "@/lib/ingest/pipeline";
import { retrieve } from "@/lib/retrieval/retrieve";
import { buildContext } from "@/lib/rag/context";

const PAGES: string[][] = [
  ["Message from the Director", "This year the agency modernised its printing plant and", "trained new apprentices in digital publishing."],
  ["Financial Highlights", "Total revenue for fiscal year 2023 was 1.2 billion dollars.", "Net income for fiscal year 2023 was 45 million dollars."],
  ["Passports and Secure Credentials", "The agency produced 18 million passports in fiscal year 2023", "for the Department of State, a record volume."],
  ["Workforce", "The agency employed 1,500 people at the end of the year.", "Apprenticeship programs grew across all trades."],
];

async function makePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  PAGES.forEach((lines, i) => {
    const page = pdf.addPage([612, 792]);
    page.drawText("GPO Annual Report 2023", { x: 72, y: 760, size: 9, font });
    lines.forEach((line, j) => page.drawText(line, { x: 72, y: 700 - j * 18, size: j === 0 ? 16 : 11, font }));
    page.drawText(String(i + 1), { x: 300, y: 40, size: 9, font });
  });
  return pdf.save();
}

let pdfBytes: Uint8Array;
let db: Awaited<ReturnType<typeof startTestDatabase>>;
let sql: Sql;
const embedder = createFakeEmbedder(768);

beforeAll(async () => {
  // Built once: pdf-lib stamps the creation time, so two builds differ by a byte.
  pdfBytes = await makePdf();
  db = await startTestDatabase("gpo");
  sql = createDb(db.url, { max: 1 });
  await migrate(sql, { schema: "gpo", directory: path.resolve("supabase/migrations"), log: () => {} });
});

afterAll(async () => {
  await sql?.end();
  await db?.stop();
});

describe("ingest → retrieve against Postgres", () => {
  let runId: string;

  it("migrations are idempotent", async () => {
    expect(await migrate(sql, { schema: "gpo", directory: path.resolve("supabase/migrations"), log: () => {} })).toEqual([]);
  });

  it("ingests into a completed, active run with verified vectors", async () => {
    const result = await ingest({ sql, embedder }, { data: pdfBytes, activate: true, log: () => {} });
    expect(result.skipped).toBe(false);
    runId = result.runId;
    const run = await getActiveRun(sql);
    expect(run?.id).toBe(runId);
    expect(run?.status).toBe("completed");
    expect(run?.chunkCount).toBeGreaterThan(0);
  });

  it("removed the running header and kept page/section data", async () => {
    const chunks = await listChunks(sql, runId, { page: 2 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].content).not.toContain("GPO Annual Report 2023");
    expect(chunks[0].content).toContain("1.2 billion");
    expect(chunks[0].sectionPath).toBe("Financial Highlights");
  });

  it("re-ingesting the same file and config is a no-op", async () => {
    const again = await ingest({ sql, embedder }, { data: pdfBytes, log: () => {} });
    expect(again.skipped).toBe(true);
    expect((await listRuns(sql)).length).toBe(1);
  });

  it("vector search ranks the right page first", async () => {
    const run = (await getActiveRun(sql))!;
    const result = await retrieve({ sql, embedder }, run, "How many passports were produced in fiscal year 2023?", { topK: 3 });
    expect(result.chunks[0].pageStart).toBe(3);
    expect(result.chunks[0].similarity).toBeGreaterThan(result.chunks.at(-1)!.similarity - 1e-9);
  });

  it("hybrid search fuses keyword and vector ranks", async () => {
    const run = (await getActiveRun(sql))!;
    const result = await retrieve({ sql, embedder }, run, "net income", { mode: "hybrid", topK: 3 });
    expect(result.chunks[0].pageStart).toBe(2);
    expect(result.chunks[0].keywordRank).toBe(1);
  });

  it("refuses to search a run embedded with a different model", async () => {
    const run = (await getActiveRun(sql))!;
    await expect(retrieve({ sql, embedder: createFakeEmbedder(384) }, run, "revenue")).rejects.toThrow(/embedded with/);
  });

  it("builds numbered context and logs queries", async () => {
    const run = (await getActiveRun(sql))!;
    const result = await retrieve({ sql, embedder }, run, "workforce apprentices", { topK: 2 });
    const context = buildContext(result.chunks);
    expect(context).toMatch(/<chunk id="1" pages="\d+"/);
    const id = await logQuery(sql, {
      runId: run.id, question: "q", mode: "vector", topK: 2, retrieved: result.chunks, answer: "a [1]",
      citations: [1], invalidCitations: [], generationModel: "test", latencyMs: 10, firstTokenMs: 5, error: null, source: "cli",
    });
    expect(id).toMatch(/[0-9a-f-]{36}/);
  });

  it("only completed runs can be activated", async () => {
    await expect(activateRun(sql, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(/No ingestion run/);
  });
});
