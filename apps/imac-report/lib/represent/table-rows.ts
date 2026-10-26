import { CONFIG } from "../config";
import type { TableElement } from "../extract/tables";

/**
 * One sentence per table row (05 §2): a question about one cell can't match
 * a whole-table embedding, but it matches "for iMac 24-inch (four ports),
 * Sleep mode is 0.9 W". Wide tables go one sentence per (row, column group).
 */
function withUnit(value: string, unit: string | undefined): string {
  if (!unit || !value || /[a-z%]/i.test(value) || unit.length > 12) return value;
  return `${value} ${unit}`;
}

export function rowSentences(table: TableElement, notes: string[]): { sentence: string; row: number }[] {
  const headerCols = Math.max(1, table.rowHeaderCols);
  const valueCols = table.columns.slice(headerCols).map((name, i) => ({ name: name || `column ${i + headerCols + 1}`, index: i + headerCols }));
  const groupSize = valueCols.length > CONFIG.chunk.wideTableColumns ? 6 : valueCols.length || 1;
  const title = table.title ? `Table "${table.title}"` : "Table";
  const suffix = notes.length ? ` [Notes: ${notes.join(" ")}]` : "";

  return table.rows.flatMap((row, rowIndex) => {
    const label = row.slice(0, headerCols).filter(Boolean).join(", ") || `row ${rowIndex + 1}`;
    const sentences: { sentence: string; row: number }[] = [];
    for (let start = 0; start < valueCols.length; start += groupSize) {
      const parts = valueCols
        .slice(start, start + groupSize)
        .filter((col) => row[col.index])
        .map((col) => `${col.name} is ${withUnit(row[col.index], table.unit)}`);
      if (parts.length) sentences.push({ sentence: `${title} (page ${table.page}): for ${label}, ${parts.join("; ")}.${suffix}`, row: rowIndex });
    }
    return sentences;
  });
}

export function tableSummary(table: TableElement): string {
  const headerCols = Math.max(1, table.rowHeaderCols);
  const labels = table.rows.map((row) => row.slice(0, headerCols).filter(Boolean).join(", ")).filter(Boolean);
  return [
    table.title ? `Table: ${table.title}` : "Table",
    table.unit ? `Unit: ${table.unit}` : "",
    `Columns: ${table.columns.filter(Boolean).join(" | ")}`,
    labels.length ? `Rows: ${labels.slice(0, 30).join("; ")}` : "",
    table.notes ? `Notes: ${table.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
