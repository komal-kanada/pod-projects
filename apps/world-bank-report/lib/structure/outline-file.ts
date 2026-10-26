import { readFile } from "node:fs/promises";
import { z } from "zod";
import { DOCUMENT } from "../config";
import type { ParsedReport } from "../types";
import type { OutlineItem } from "./tree";

const schema = z.object({
  entries: z.array(
    z.object({
      title: z.string().min(1),
      page: z.number().int().positive(),
      level: z.number().int().min(1),
      kind: z.enum(["front_matter", "chapter", "section", "box", "appendix", "references"]).optional(),
      pageEnd: z.number().int().positive().optional(),
    }),
  ),
});

/** data/outline.json when present, else the PDF's own bookmarks. */
export async function loadOutline(parsed: ParsedReport, path = DOCUMENT.outlinePath): Promise<OutlineItem[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return parsed.outline;
  }
  return schema.parse(JSON.parse(raw)).entries.map(({ page, ...entry }) => ({ ...entry, pageNumber: page }));
}
