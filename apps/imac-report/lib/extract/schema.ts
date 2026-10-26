import { Type } from "@pod/ai";
import { z } from "zod";

/**
 * The JSON contract for model-extracted elements: a Gemini responseSchema
 * (so the model is constrained) and a zod schema (so what comes back is
 * checked) describing the same shape.
 */
const point = z.object({
  label: z.string(),
  valueText: z.string(),
  value: z.number().nullable().optional(),
  valueSource: z.enum(["labelled", "estimated"]),
});

export const rawElementSchema = z.object({
  type: z.enum(["heading", "text", "table", "chart", "footnote", "callout", "image"]),
  box_2d: z.array(z.number()).length(4).optional(),
  level: z.number().optional(),
  text: z.string().optional(),
  title: z.string().nullable().optional(),
  columns: z.array(z.string()).optional(),
  rows: z.array(z.array(z.string())).optional(),
  rowHeaderCols: z.number().optional(),
  unit: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  chartType: z.string().optional(),
  xLabel: z.string().nullable().optional(),
  yLabel: z.string().nullable().optional(),
  series: z.array(z.object({ name: z.string(), points: z.array(point) })).optional(),
  description: z.string().optional(),
  marker: z.string().optional(),
  figure: z.string().nullable().optional(),
  iconMeaning: z.string().nullable().optional(),
  footnoteRefs: z.array(z.string()).optional(),
});
export type RawElement = z.infer<typeof rawElementSchema>;

const S = Type.STRING;
const pointSchema = {
  type: Type.OBJECT,
  properties: {
    label: { type: S },
    valueText: { type: S },
    value: { type: Type.NUMBER, nullable: true },
    valueSource: { type: S, enum: ["labelled", "estimated"] },
  },
  required: ["label", "valueText", "valueSource"],
};
const seriesSchema = {
  type: Type.ARRAY,
  items: { type: Type.OBJECT, properties: { name: { type: S }, points: { type: Type.ARRAY, items: pointSchema } }, required: ["name", "points"] },
};

const elementProperties = {
  type: { type: S, enum: ["heading", "text", "table", "chart", "footnote", "callout", "image"] },
  box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
  level: { type: Type.INTEGER },
  text: { type: S },
  title: { type: S, nullable: true },
  columns: { type: Type.ARRAY, items: { type: S } },
  rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: S } } },
  rowHeaderCols: { type: Type.INTEGER },
  unit: { type: S, nullable: true },
  notes: { type: S, nullable: true },
  chartType: { type: S, enum: ["bar", "stacked_bar", "pie", "donut", "line", "other"] },
  xLabel: { type: S, nullable: true },
  yLabel: { type: S, nullable: true },
  series: seriesSchema,
  description: { type: S },
  marker: { type: S },
  figure: { type: S, nullable: true },
  iconMeaning: { type: S, nullable: true },
  footnoteRefs: { type: Type.ARRAY, items: { type: S } },
};

export const pageElementsResponseSchema = {
  type: Type.ARRAY,
  items: { type: Type.OBJECT, properties: elementProperties, required: ["type", "box_2d"] },
};

export const singleElementResponseSchema = { type: Type.OBJECT, properties: elementProperties };
