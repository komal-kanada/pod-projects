import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { flattenOutline, readPdf } from "./pdf";

async function makePdf(pages: string[][]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = pdf.addPage([612, 792]);
    lines.forEach((line, index) => {
      page.drawText(line, { x: 72, y: 720 - index * 18, size: 12, font });
    });
  }
  return pdf.save();
}

describe("readPdf", () => {
  it("returns text per page with labels defaulting to page numbers", async () => {
    const data = await makePdf([["Message from the Director", "We printed more."], ["Financial Highlights"]]);
    const doc = await readPdf(data);
    expect(doc.pageCount).toBe(2);
    expect(doc.pages[0].pageNumber).toBe(1);
    expect(doc.pages[0].pageLabel).toBe("1");
    expect(doc.pages[0].text).toContain("Message from the Director");
    expect(doc.pages[1].text).toContain("Financial Highlights");
    expect(doc.outline).toEqual([]);
    expect(flattenOutline(doc.outline)).toEqual([]);
  });

  it("rejects bytes that aren't a PDF", async () => {
    await expect(readPdf(new TextEncoder().encode("not a pdf"))).rejects.toThrow(/couldn't be opened/);
  });
});
