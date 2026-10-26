import { chartAsMarkdown } from "../extract/charts";
import type { Element } from "../types";

/** The faithful, LLM-facing rendering of an element (stored as elements.markdown). */
export function elementMarkdown(element: Element): string {
  switch (element.type) {
    case "heading":
      return `${"#".repeat(Math.min(3, element.level))} ${element.text}`;
    case "text":
      return element.text;
    case "table":
      return [element.title ? `Table: ${element.title}` : "Table", element.unit ? `Unit: ${element.unit}` : "", element.markdown, element.notes ? `Notes: ${element.notes}` : ""].filter(Boolean).join("\n");
    case "chart":
      return [element.title ? `Chart: ${element.title}` : "Chart", chartAsMarkdown(element)].join("\n");
    case "footnote":
      return `[${element.marker}] ${element.text}`;
    case "callout":
      return [element.figure, element.text, element.iconMeaning ? `(icon: ${element.iconMeaning})` : ""].filter(Boolean).join(" — ");
    case "image":
      return `Image: ${element.description}`;
  }
}

export function elementTitle(element: Element): string | null {
  switch (element.type) {
    case "table":
    case "chart":
      return element.title ?? null;
    case "heading":
      return element.text;
    case "footnote":
      return `Footnote ${element.marker}`;
    case "callout":
      return element.figure ?? null;
    default:
      return null;
  }
}

export function elementPlainText(element: Element): string {
  return element.type === "text" || element.type === "heading" || element.type === "footnote" || element.type === "callout"
    ? `${"figure" in element && element.figure ? `${element.figure} ` : ""}${element.text}`
    : elementMarkdown(element);
}
