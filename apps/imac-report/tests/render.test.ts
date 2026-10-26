import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { x0TextLayer } from "@/lib/extract/strategies/x0-text-layer";
import { renderDocument } from "@/lib/render/pages";
import { textInside } from "@/lib/render/text-layer";
import { cropPng } from "@/lib/render/crop";
import sharp from "sharp";
import type { RenderedPage } from "@/lib/types";

let dir: string;
let pages: RenderedPage[];
let data: Uint8Array;

beforeAll(async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i += 1) {
    const page = pdf.addPage([612, 792]);
    page.drawText("iMac Environmental Report", { x: 72, y: 770, size: 8, font });
    page.drawText(i === 0 ? "Climate Change" : `Section ${i}`, { x: 72, y: 700, size: 20, font });
    page.drawText("The carbon footprint of iMac is 410 kg CO2e.", { x: 72, y: 660, size: 11, font });
    page.drawText("1", { x: 305, y: 666, size: 6, font });
    page.drawText("Production accounts for 70% of emissions.", { x: 72, y: 645, size: 11, font });
    page.drawText("1 Use phase assumes four years of use.", { x: 72, y: 60, size: 8, font });
    page.drawText(String(i + 1), { x: 300, y: 25, size: 8, font });
  }
  data = await pdf.save();
  dir = await mkdtemp(path.join(tmpdir(), "imac-render-"));
  pages = await renderDocument(data, { cacheDir: dir, dpi: 72, log: () => {} });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("render + text layer", () => {
  it("renders every page with size and a stable image hash", () => {
    expect(pages).toHaveLength(3);
    expect(pages[0].width).toBe(612);
    expect(pages[0].imageHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("detects the superscript footnote marker", () => {
    const supers = pages[0].lines.filter((l) => l.superscript).map((l) => l.text.trim());
    expect(supers).toEqual(["1"]);
    expect(pages[0].text).not.toMatch(/CO2e\.\n1\n/);
  });

  it("finds text inside a box", () => {
    expect(textInside(pages[0].lines, [0, 0, 200, 1000])).toContain("Climate Change");
  });

  it("crops a normalised box", async () => {
    const png = await cropPng(pages[0].imagePath, [100, 100, 300, 600], { padding: 0 });
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(Math.ceil(0.5 * 612));
  });
});

describe("X0 text-layer strategy", () => {
  it("drops running headers and page numbers, finds headings, paragraphs and footnotes", async () => {
    const elements = await x0TextLayer.extractPage(pages[0], { gemini: null, data, pages, model: "none" });
    const types = elements.map((e) => e.type);
    expect(types).toContain("heading");
    expect(types).toContain("text");
    expect(types).toContain("footnote");
    const all = JSON.stringify(elements);
    expect(all).not.toContain("iMac Environmental Report");
    const text = elements.find((e) => e.type === "text");
    expect(text && "text" in text ? text.text : "").toContain("410 kg CO2e");
    expect(text?.footnoteRefs).toEqual(["1"]);
    const footnote = elements.find((e) => e.type === "footnote");
    expect(footnote).toMatchObject({ marker: "1", text: "Use phase assumes four years of use." });
  });
});
