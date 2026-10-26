import { readFile } from "node:fs/promises";
import { z } from "zod";
import { DOCUMENT } from "../config";
import type { SupplementEntry } from "./structure";

const schema = z.object({
  entries: z.array(z.object({ title: z.string().min(1), page: z.number().int().positive(), at: z.literal("top").optional() })),
});

/** Reads data/outline-supplement.json; no file means no supplement. */
export async function loadOutlineSupplement(path = DOCUMENT.outlineSupplementPath): Promise<SupplementEntry[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return [];
  }
  return schema.parse(JSON.parse(raw)).entries.map(({ title, page, at }) => (at ? { title, page, at } : { title, page }));
}
