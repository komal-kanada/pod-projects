import type { Block, Footnote } from "../types";

/**
 * Tables and figures become their own chunks (05 §2): tables carry most
 * numeric answers in an economic report, and splitting one as prose loses
 * its headers.
 *
 * - `content` (what the model reads) is the whole table: caption, markdown,
 *   notes, footnotes. Tables over the limit split by row groups with the
 *   header row repeated in every part.
 * - `embedText` (what is searched) describes the table instead of embedding
 *   its numeric grid: a one-line summary, the header row and the row labels.
 *   Exact numbers still match through keyword search on `content`.
 */
export type TableBlock = Extract<Block, { kind: "table" }>;
export type FigureBlock = Extract<Block, { kind: "figure" }>;

export function footnoteText(footnotes: Footnote[] | undefined): string {
  if (!footnotes?.length) return "";
  return `\nNotes: ${footnotes.map((f) => `[${f.n}] ${f.text}`).join(" ")}`;
}

export function tableTitle(table: TableBlock): string {
  return table.caption ?? `Table (p. ${table.page})`;
}

/** Splits a table's markdown into parts under `maxChars`, header repeated. */
export function splitTable(table: TableBlock, maxChars: number): string[] {
  const lines = table.markdown.split("\n");
  if (table.markdown.length <= maxChars || lines.length <= 3) return [table.markdown];
  const head = lines.slice(0, 2);
  const parts: string[] = [];
  let current: string[] = [];
  for (const row of lines.slice(2)) {
    const size = [...head, ...current, row].join("\n").length;
    if (current.length && size > maxChars) {
      parts.push([...head, ...current].join("\n"));
      current = [];
    }
    current.push(row);
  }
  if (current.length) parts.push([...head, ...current].join("\n"));
  return parts;
}

export function tableContent(table: TableBlock, markdown: string, part?: { index: number; total: number }): string {
  const title = tableTitle(table) + (part && part.total > 1 ? ` (part ${part.index + 1} of ${part.total})` : "");
  return [title, markdown, table.notes ?? ""].filter(Boolean).join("\n") + footnoteText(table.footnotes);
}

/** Deterministic fallback for the table summary line when no LLM line exists. */
export function defaultTableLine(table: TableBlock): string {
  const columns = table.header.filter(Boolean).slice(0, 8).join(", ");
  return `${tableTitle(table)} — columns: ${columns}`;
}

export function tableEmbedBody(table: TableBlock, summaryLine: string): string {
  const labels = table.rowLabels.slice(0, 40).join("; ");
  return [
    tableTitle(table),
    summaryLine,
    `Columns: ${table.header.filter(Boolean).join(" | ")}`,
    labels ? `Rows: ${labels}` : "",
    table.notes ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function figureContent(figure: FigureBlock): string {
  return [`Figure: ${figure.title}`, figure.description, figure.source ? `Source: ${figure.source}` : ""].filter(Boolean).join("\n");
}
