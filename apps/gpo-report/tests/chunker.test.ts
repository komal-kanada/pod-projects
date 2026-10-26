import { describe, expect, it } from "vitest";
import { RAG_CONFIG } from "@/lib/config";
import { chunkParagraphs } from "@/lib/ingest/chunker";
import type { Paragraph } from "@/lib/types";

const sentence = (i: number) => `Sentence number ${i} describes the agency's work in some detail.`;
const paragraph = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => sentence(from + i)).join(" ");

const labels = new Map([[1, "i"], [2, "1"], [3, "2"]]);
const config = { ...RAG_CONFIG.chunk, targetChars: 600, overlapChars: 120, minChars: 200 };

describe("chunkParagraphs", () => {
  const paragraphs: Paragraph[] = [
    { text: paragraph(0, 6), pageNumber: 1, sectionPath: ["Message"] },
    { text: paragraph(6, 6), pageNumber: 2, sectionPath: ["Message"] },
    { text: paragraph(12, 20), pageNumber: 2, sectionPath: ["Finances"] },
    { text: paragraph(32, 4), pageNumber: 3, sectionPath: ["Finances"] },
  ];
  const chunks = chunkParagraphs(paragraphs, labels, config);

  it("respects the size limit (plus overlap)", () => {
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(config.targetChars + config.overlapChars + 2);
    }
  });

  it("never mixes sections", () => {
    for (const chunk of chunks) {
      expect(["Message", "Finances"]).toContain(chunk.sectionPath);
    }
    const message = chunks.filter((c) => c.sectionPath === "Message");
    expect(message.some((c) => c.content.includes("number 0 "))).toBe(true);
    expect(message.some((c) => c.content.includes("number 12 "))).toBe(false);
  });

  it("lets a chunk span pages and records both, with printed labels", () => {
    const spanning = chunks.find((c) => c.pageStart !== c.pageEnd);
    expect(spanning).toBeDefined();
    expect(chunks[0].pageLabelStart).toBe("i");
  });

  it("carries overlap from the previous chunk in the same section", () => {
    const finances = chunks.filter((c) => c.sectionPath === "Finances");
    expect(finances.length).toBeGreaterThan(1);
    const tailOfFirst = finances[0].content.slice(-60);
    expect(finances[1].content).toContain(tailOfFirst.slice(tailOfFirst.indexOf("Sentence")));
  });

  it("embeds a contextual header but keeps content clean", () => {
    expect(chunks[0].embedText.split("\n")[0]).toBe("GPO Annual Report | Section: Message | Page i");
    expect(chunks[0].content.startsWith("Sentence")).toBe(true);
    const plain = chunkParagraphs(paragraphs, labels, { ...config, contextualHeader: false });
    expect(plain[0].embedText).toBe(plain[0].content);
  });

  it("numbers chunks in reading order and merges tiny fragments", () => {
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
    const tiny = chunkParagraphs(
      [
        { text: paragraph(0, 8), pageNumber: 1, sectionPath: ["A", "x"] },
        { text: "Short tail.", pageNumber: 1, sectionPath: ["A", "y"] },
      ],
      labels,
      config,
    );
    expect(tiny.at(-1)!.content.endsWith("Short tail.")).toBe(true);
    expect(tiny.at(-1)!.sectionPath).toBe("A");
  });
});
