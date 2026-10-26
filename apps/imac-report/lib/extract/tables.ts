import type { Element } from "../types";

/**
 * Table clean-up (04 §4): trimmed cells, ragged rows padded, the unit pulled
 * from the title or headers, a markdown rendering for the model, and tables
 * that continue onto the next page merged.
 */
export type TableElement = Extract<Element, { type: "table" }>;

const UNIT = /\(([^)]*(?:kWh|kg|%|g|W|CO\s?[₂2]e?|percent|watts?)[^)]*)\)|\b(kg CO\s?[₂2]e|kWh|percent)\b/i;

export function detectUnit(title: string | undefined, columns: string[]): string | undefined {
  for (const text of [title ?? "", ...columns]) {
    const match = text.match(UNIT);
    if (match) return (match[1] ?? match[2]).trim();
  }
  return undefined;
}

function cell(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function tableMarkdown(columns: string[], rows: string[][]): string {
  const escape = (value: string) => value.replace(/\|/g, "\\|");
  const width = Math.max(columns.length, ...rows.map((r) => r.length));
  const head = Array.from({ length: width }, (_, i) => escape(columns[i] ?? ""));
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${Array.from({ length: width }, (_, i) => escape(row[i] ?? "")).join(" | ")} |`),
  ].join("\n");
}

export function normaliseTable(table: Omit<TableElement, "markdown"> & { markdown?: string }): TableElement {
  const columns = table.columns.map(cell);
  const width = Math.max(columns.length, ...table.rows.map((r) => r.length));
  const rows = table.rows
    .map((row) => Array.from({ length: width }, (_, i) => cell(row[i])))
    .filter((row) => row.some(Boolean));
  const unit = table.unit?.trim() || detectUnit(table.title, columns);
  return {
    ...table,
    columns,
    rows,
    rowHeaderCols: Math.max(1, Math.min(table.rowHeaderCols || 1, width - 1)),
    unit,
    markdown: tableMarkdown(columns, rows),
  };
}

/** Same column headers on the next page → one table (rows appended). */
export function mergeMultiPageTables(elements: Element[]): Element[] {
  const out: Element[] = [];
  for (const element of elements) {
    if (element.type === "table") {
      const previous = [...out].reverse().find((e) => e.type === "table") as TableElement | undefined;
      const lastOnPreviousPage = previous && previous.page === element.page - 1 && out.filter((e) => e.page === previous.page).at(-1) === previous;
      const firstOnPage = !out.some((e) => e.page === element.page && e.type !== "heading");
      if (lastOnPreviousPage && firstOnPage && previous!.columns.join("|") === element.columns.join("|")) {
        const merged = normaliseTable({ ...previous!, rows: [...previous!.rows, ...element.rows] });
        out[out.indexOf(previous!)] = { ...merged, footnoteRefs: [...new Set([...previous!.footnoteRefs, ...element.footnoteRefs])] };
        continue;
      }
    }
    out.push(element);
  }
  return out;
}
