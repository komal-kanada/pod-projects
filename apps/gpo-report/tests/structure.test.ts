import { describe, expect, it } from "vitest";
import { assignSections, looksLikeHeading } from "@/lib/ingest/structure";

describe("looksLikeHeading", () => {
  it("accepts short title-case or caps lines followed by longer text", () => {
    expect(looksLikeHeading("Financial Highlights", "Revenue for the year rose by a large amount.")).toBe(true);
    expect(looksLikeHeading("MESSAGE FROM THE DIRECTOR", "It has been a remarkable year for the agency.")).toBe(true);
  });

  it("rejects sentences, numbers and lowercase lines", () => {
    expect(looksLikeHeading("Revenue rose.", "x".repeat(50))).toBe(false);
    expect(looksLikeHeading("1,234 56.7", "x".repeat(50))).toBe(false);
    expect(looksLikeHeading("the agency printed", "x".repeat(50))).toBe(false);
  });
});

describe("assignSections", () => {
  it("skips an outline level named after a merged file", () => {
    const pages = [{ pageNumber: 1, text: "Funding\nGPO is funded by appropriations and revenue from customers." }];
    const outline = [
      { title: "FY 2018 Statements FINAL.pdf", pageNumber: 1, level: 0, children: [{ title: "Funding", pageNumber: 1, level: 1, children: [] }] },
    ];
    expect(assignSections(pages, outline).paragraphs[0].sectionPath).toEqual(["Funding"]);
  });

  it("adds supplement entries where the outline doesn't reach", () => {
    const pages = [
      { pageNumber: 1, text: "Body that comes before its heading in the text layer.\nA Message from the Director" },
      { pageNumber: 2, text: "Previous section continues here and ends.\nGPO and Congress\nGPO prints the Congressional Record every day." },
      { pageNumber: 3, text: "Notes\nThe statements are audited by an independent firm." },
    ];
    const outline = [{ title: "Notes", pageNumber: 3, level: 1, children: [] }];
    const supplement = [
      { title: "A Message from the Director", page: 1, at: "top" as const },
      { title: "GPO and Congress", page: 2 },
    ];
    const { paragraphs } = assignSections(pages, outline, supplement);
    expect(paragraphs.map((p) => [p.pageNumber, p.sectionPath.join("/"), p.text.slice(0, 8)])).toEqual([
      [1, "A Message from the Director", "Body tha"],
      // A top-of-page entry doesn't hunt for its heading, so the stray line stays as text.
      [1, "A Message from the Director", "A Messag"],
      [2, "A Message from the Director", "Previous"],
      [2, "GPO and Congress", "GPO prin"],
      [3, "Notes", "The stat"],
    ]);
  });

  it("uses the outline when present, switching at the matching heading", () => {
    const pages = [
      { pageNumber: 1, text: "Message from the Director\nWe had a strong year overall and printed a lot." },
      { pageNumber: 2, text: "Intro paragraph that continues the message from before.\nFinancial Highlights\nRevenue was $1.2 billion in FY2023." },
    ];
    const outline = [
      { title: "Message from the Director", pageNumber: 1, level: 1, children: [] },
      { title: "Financial Highlights", pageNumber: 2, level: 1, children: [] },
    ];
    const { paragraphs, source } = assignSections(pages, outline);
    expect(source).toBe("outline");
    expect(paragraphs.map((p) => [p.pageNumber, p.sectionPath.join("/"), p.text.slice(0, 12)])).toEqual([
      [1, "Message from the Director", "We had a str"],
      [2, "Message from the Director", "Intro paragr"],
      [2, "Financial Highlights", "Revenue was "],
    ]);
  });

  it("nests outline children into paths", () => {
    const outline = [
      { title: "Financial Highlights", pageNumber: 1, level: 1, children: [{ title: "Revenue", pageNumber: 2, level: 2, children: [] }] },
    ];
    const { paragraphs } = assignSections(
      [
        { pageNumber: 1, text: "Overview text for the financial section of the report." },
        { pageNumber: 2, text: "Sales of publications grew steadily across the year." },
      ],
      outline,
    );
    expect(paragraphs[1].sectionPath).toEqual(["Financial Highlights", "Revenue"]);
  });

  it("falls back to heuristic headings without an outline", () => {
    const { paragraphs, source, sections } = assignSections(
      [{ pageNumber: 1, text: "Workforce Development\nThe agency hired many new apprentices this year." }],
      [],
    );
    expect(source).toBe("heuristic");
    expect(sections).toEqual(["Workforce Development"]);
    expect(paragraphs[0].sectionPath).toEqual(["Workforce Development"]);
  });
});
