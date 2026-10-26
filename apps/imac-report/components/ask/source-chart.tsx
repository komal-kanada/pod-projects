"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartSeries } from "@/lib/types";

const SERIES_COLOURS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-4)", "var(--chart-3)"];

/**
 * The chart redrawn from the extracted data — labelled values solid,
 * estimated ones faded and marked "~" — so a reader can compare it with the
 * original crop beside it.
 */
export function SourceChart({ series, unit }: { series: ChartSeries[]; unit?: string | null }) {
  const labels = [...new Set(series.flatMap((s) => s.points.map((p) => p.label)))];
  const rows = labels.map((label) => {
    const row: Record<string, string | number | null> = { label };
    series.forEach((s, i) => {
      const point = s.points.find((p) => p.label === label);
      row[`s${i}`] = point?.value ?? null;
      row[`t${i}`] = point ? point.valueText : "";
      row[`e${i}`] = point?.valueSource === "estimated" ? 1 : 0;
    });
    return row;
  });

  if (rows.every((row) => series.every((_, i) => row[`s${i}`] === null))) {
    return <p className="text-muted-foreground text-[0.8125rem]">No numeric values to redraw.</p>;
  }

  return (
    <figure>
      <div className="h-48 w-full" role="img" aria-label={`Bar chart of ${labels.length} categories`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--hairline)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={0} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} unit={unit === "%" ? "%" : undefined} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--hairline)", borderRadius: 10, fontSize: 12 }}
              formatter={(value, name, item) => {
                const i = Number(String(name).slice(1));
                const estimated = (item.payload as Record<string, number>)[`e${i}`] === 1;
                return [`${(item.payload as Record<string, string>)[`t${i}`]}${estimated ? " (estimated)" : ""}`, series[i]?.name ?? ""];
              }}
            />
            {series.map((s, i) => (
              <Bar key={s.name + i} dataKey={`s${i}`} name={`s${i}`} radius={[4, 4, 0, 0]} maxBarSize={36}>
                {rows.map((row, j) => (
                  <Cell key={j} fill={SERIES_COLOURS[i % SERIES_COLOURS.length]} fillOpacity={row[`e${i}`] ? 0.3 : 0.9} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-muted-foreground mt-1 text-[0.75rem]">
        Redrawn from extracted values. Faded bars are estimated (not printed on the chart).
      </figcaption>
    </figure>
  );
}
