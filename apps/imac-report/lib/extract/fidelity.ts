import type { Element, RenderedPage } from "../types";

/**
 * Every number the model extracted (text, tables, callouts, labelled chart
 * values) must exist in the page's text layer — vision models misread
 * digits; the text layer doesn't (04 §4). Chart labels drawn as pixels
 * aren't in the text layer, so a chart is only checked when its labels
 * evidently are; otherwise it's marked unchecked.
 */
function numberTokens(text: string): string[] {
  return [...text.matchAll(/[−–-]?\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/[−–]/g, "-").replace(/,/g, "").replace(/^-/, ""));
}

function elementNumbers(element: Element): string[] {
  switch (element.type) {
    case "text":
    case "heading":
    case "footnote":
      return numberTokens(element.text.replace(/\^\d+/g, ""));
    case "callout":
      return numberTokens(`${element.figure ?? ""} ${element.text}`);
    case "table":
      return numberTokens([...element.columns, ...element.rows.flat()].join(" ").replace(/\^\d+/g, ""));
    case "chart":
      return numberTokens(element.series.flatMap((s) => s.points.filter((p) => p.valueSource === "labelled").map((p) => p.valueText)).join(" "));
    default:
      return [];
  }
}

export function checkFidelity(element: Element, page: RenderedPage): Element {
  const layer = new Set(numberTokens(page.lines.map((l) => l.text).join(" ")));
  const numbers = elementNumbers(element);
  if (numbers.length === 0) return { ...element, fidelity: { checked: true, numericPrecision: null, flags: element.fidelity?.flags ?? [] } };

  const unmatched = numbers.filter((n) => !layer.has(n));
  const precision = (numbers.length - unmatched.length) / numbers.length;

  // Rasterised charts: none of their numbers are text — skip rather than fail.
  if (element.type === "chart" && precision === 0) {
    return { ...element, fidelity: { checked: false, numericPrecision: null, flags: element.fidelity?.flags ?? [] } };
  }
  const flags = [...(element.fidelity?.flags ?? [])];
  if (unmatched.length) flags.push(`numbers not in text layer: ${[...new Set(unmatched)].slice(0, 6).join(", ")}`);
  return { ...element, fidelity: { checked: true, numericPrecision: precision, flags } };
}
