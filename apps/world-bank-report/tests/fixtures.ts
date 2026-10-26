import type { Gemini } from "@pod/ai";
import type { ParsedReport } from "@/lib/types";

/** A tiny "report" in Gemini-markdown form, plus its text layer. */
export const MARKDOWN_PAGES = [
  `# Global Economic Prospects 2025

## Foreword

This report examines the outlook for the global economy in 2025 and 2026.`,
  `# Chapter 1 Global Outlook

## Summary

Global growth is projected to edge down to 2.7 percent in 2025 as trade tensions weigh on activity. Inflation continues to moderate in most economies.

Table: Table 1.1 Real GDP growth

| Region | 2023 | 2024e | 2025f | 2026f |
| --- | --- | --- | --- | --- |
| World | 2.6 | 2.7 | 2.7 | 2.8 |
| South Asia | 6.6 | 6.0 | 6.2 | 6.2 |
| Sub-Saharan Africa | 2.9 | 3.4 | 3.8 | 4.1 |

Notes: e = estimate; f = forecast.`,
  `## Risks to the outlook

Downside risks dominate, including escalating trade restrictions and financial stress^1. Climate-related disasters add to the risks

<footnote n="1">Financial stress refers to sudden tightening of global financing conditions.</footnote>`,
  `continuing into next year, especially for commodity exporters.

<box title="Box 1.1 Trade policy uncertainty">
Trade policy uncertainty rose sharply in 2024. Higher tariffs could reduce global trade growth by 0.5 percentage point.
</box>`,
  `# Chapter 2 Regional Outlooks

## South Asia

### Outlook

Growth in South Asia is projected at 6.2 percent in 2025, supported by robust activity in India. Private consumption remains strong.

<figure title="Figure 2.5.1 South Asia growth">The chart shows growth in South Asia from 2023 to 2026. Labelled values are 6.6 in 2023 and 6.2 in 2026.</figure>`,
  `## Sub-Saharan Africa

### Outlook

Growth in Sub-Saharan Africa is forecast to firm to 3.8 percent in 2025 as inflation eases in Nigeria and Ethiopia.

# References

World Bank. 2024. Global Economic Prospects. Washington, DC.`,
];

export const TEXT_PAGES = MARKDOWN_PAGES.map((page) =>
  page
    .replace(/<[^>]+>/g, " ")
    .replace(/^#+\s*/gm, "")
    .replace(/\|/g, " ")
    .replace(/-{3,}/g, " "),
);

export function fixtureReport(): ParsedReport {
  return {
    sha256: "fixture-sha",
    pageCount: MARKDOWN_PAGES.length,
    pageLabels: ["i", "1", "2", "3", "4", "5"],
    outline: [
      { title: "Chapter 1 Global Outlook", pageNumber: 2, level: 1 },
      { title: "Chapter 2 Regional Outlooks", pageNumber: 5, level: 1 },
      { title: "References", pageNumber: 6, level: 1 },
    ],
    textPages: TEXT_PAGES,
    markdownPages: MARKDOWN_PAGES,
    parseSource: MARKDOWN_PAGES.map(() => "gemini" as const),
  };
}

/**
 * A Gemini stand-in: canned query analysis and rerank scores keyed off the
 * prompt, and a fixed streamed answer. Lets every preset run offline.
 */
export function stubGemini(): Gemini {
  return {
    generationModel: "stub",
    sdk: null as never,
    async generateText() {
      return "A one-line description.";
    },
    async generateJson<T>(request: { prompt: unknown; validate?: (v: unknown) => T }) {
      const prompt = typeof request.prompt === "string" ? request.prompt : JSON.stringify(request.prompt);
      let value: unknown;
      if (prompt.includes("candidate passages")) {
        const ids = [...prompt.matchAll(/<passage id="(c\d+)"[^>]*>\n([\s\S]*?)<\/passage>/g)];
        value = ids.map(([, id, body]) => ({ id, score: /South Asia/.test(body) ? 9 : /Sub-Saharan/.test(body) ? 8 : 2 }));
      } else {
        value = {
          intent: "comparison",
          rewrittenQuery: "growth forecast South Asia Sub-Saharan Africa 2025",
          subQueries: ["South Asia growth 2025", "Sub-Saharan Africa growth 2025"],
          filters: { regions: ["SAR", "SSA", "Atlantis"], years: [2025] },
        };
      }
      return request.validate ? request.validate(value) : (value as T);
    },
    async *streamText() {
      yield "South Asia grows 6.2 percent in 2025 [1]";
      yield " while Sub-Saharan Africa grows 3.8 percent [2].";
    },
  };
}
