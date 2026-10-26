import type { Gemini } from "@pod/ai";
import type { Element } from "@/lib/types";

/** A small "extracted report": what X2 would produce for two pages. */
export function fixtureElements(prefix = "X2"): Element[] {
  const k = (page: number, i: number) => `${prefix}-p${String(page).padStart(2, "0")}-e${String(i).padStart(2, "0")}`;
  return [
    { key: k(1, 0), page: 1, order: 0, bbox: [40, 60, 90, 900], footnoteRefs: [], type: "heading", level: 1, text: "Climate Change" },
    { key: k(1, 1), page: 1, order: 1, bbox: [100, 60, 200, 900], footnoteRefs: ["1"], type: "text", text: "The life cycle carbon footprint of iMac is 410 kg CO₂e.^1 Production accounts for most of it." },
    {
      key: k(1, 2), page: 1, order: 2, bbox: [220, 60, 520, 940], footnoteRefs: [], type: "chart", chartType: "stacked_bar",
      title: "Life cycle carbon emissions", unit: "%", description: "Shares of emissions by life-cycle phase.",
      series: [{ name: "iMac 24-inch (two ports)", points: [
        { label: "Production", value: 70, valueText: "70%", valueSource: "labelled" },
        { label: "Transport", value: 6, valueText: "6%", valueSource: "labelled" },
        { label: "Use", value: 23, valueText: "23%", valueSource: "labelled" },
        { label: "End of life", value: null, valueText: "<1%", valueSource: "labelled" },
        { label: "Packaging", value: 12, valueText: "~12%", valueSource: "estimated" },
      ] }],
    },
    { key: k(1, 3), page: 1, order: 3, bbox: [900, 60, 960, 900], footnoteRefs: [], type: "footnote", marker: "1", text: "Use phase assumes four years of use by the first owner." },
    { key: k(2, 0), page: 2, order: 0, bbox: [40, 60, 90, 900], footnoteRefs: [], type: "heading", level: 1, text: "Energy Efficiency" },
    {
      key: k(2, 1), page: 2, order: 1, bbox: [100, 60, 400, 940], footnoteRefs: [], type: "table", title: "Energy consumption", unit: "W",
      columns: ["Mode", "iMac 24-inch (two ports)", "iMac 24-inch (four ports)"], rows: [["Off", "0.3", "0.3"], ["Sleep", "0.9", "1.0"], ["Idle", "23.1", "24.5"]],
      rowHeaderCols: 1, markdown: "",
    },
    { key: k(2, 2), page: 2, order: 2, bbox: [420, 60, 480, 500], footnoteRefs: [], type: "callout", text: "less energy than the previous generation", figure: "40%" },
  ];
}

/** Gemini stand-in: canned analysis, fixed answer that cites [1] and reports nothing odd. */
export function stubGemini(seen: { prompts: unknown[] } = { prompts: [] }): Gemini {
  return {
    generationModel: "stub",
    sdk: null as never,
    async generateText() {
      return "";
    },
    async generateJson<T>(request: { validate?: (v: unknown) => T }) {
      const value = {
        intent: "numeric",
        targetTypes: ["table"],
        variants: ["iMac 24-inch (four ports)", "iMac 99 (made up)"],
        phases: [],
        rewrittenQuery: "Sleep mode power iMac 24-inch (four ports) W",
        subQueries: [],
      };
      return request.validate ? request.validate(value) : (value as T);
    },
    async *streamText(request: { prompt: unknown }) {
      seen.prompts.push(request.prompt);
      yield "Sleep mode uses 1.0 W [1].";
    },
  };
}
