/**
 * Small helpers for writing eval reports as markdown — one table style for
 * every POD app, so results read the same across projects.
 */

export function formatMetric(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return value.toFixed(digits);
}

export function formatDelta(value: number | null, previous: number | null): string {
  if (value === null || previous === null) return "";
  const delta = value - previous;
  if (Math.abs(delta) < 0.005) return " (±0)";
  return ` (${delta > 0 ? "+" : ""}${delta.toFixed(2)})`;
}

export function markdownTable(headers: string[], rows: (string | number)[][]): string {
  const escape = (cell: string | number) => String(cell).replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

/** `20261013-1405` — sortable, filename-safe. */
export function timestampSlug(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const groups = {} as Record<K, T[]>;
  for (const item of items) (groups[key(item)] ??= []).push(item);
  return groups;
}
