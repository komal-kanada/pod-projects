import { readFile } from "node:fs/promises";
import { z } from "zod";

/** Hand-labelled ground truth (10 §1) — what the PDF really says. */
export const gtTableSchema = z.object({ page: z.number().int(), title: z.string().nullable().default(null), columns: z.array(z.string()), rows: z.array(z.array(z.string())) });
export const gtChartSchema = z.object({
  page: z.number().int(),
  title: z.string().nullable().default(null),
  chartType: z.string().optional(),
  points: z.array(z.object({ series: z.string().default(""), label: z.string(), valueText: z.string() })),
});
export const gtFootnoteSchema = z.object({
  marker: z.string(),
  text: z.string(),
  page: z.number().int().optional(),
  referencedBy: z.array(z.object({ page: z.number().int(), snippet: z.string() })).default([]),
});
export const gtCoverageSchema = z.object({ page: z.number().int(), facts: z.array(z.string()) });

export interface GroundTruth {
  tables: z.infer<typeof gtTableSchema>[];
  charts: z.infer<typeof gtChartSchema>[];
  footnotes: z.infer<typeof gtFootnoteSchema>[];
  coverage: z.infer<typeof gtCoverageSchema>[];
}

async function load<T>(file: string, schema: z.ZodType<T>): Promise<T[]> {
  try {
    return z.array(schema).parse(JSON.parse(await readFile(`eval/ground-truth/${file}`, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error(`eval/ground-truth/${file}: ${(error as Error).message}`);
  }
}

export async function loadGroundTruth(): Promise<GroundTruth> {
  return {
    tables: await load("tables.json", gtTableSchema),
    charts: await load("charts.json", gtChartSchema),
    footnotes: await load("footnotes.json", gtFootnoteSchema),
    coverage: await load("coverage.json", gtCoverageSchema),
  };
}
