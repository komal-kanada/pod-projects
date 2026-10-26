import { DOCUMENT } from "../config";

/** Contextual header prepended to every chunk's embed_text (05 §3). */
export function chunkHeader({ page, section, type, variants }: { page: number; section: string | null; type: string; variants: string[] }): string {
  return [DOCUMENT.title, `Page ${page}`, section ? `Section: ${section}` : null, `Type: ${type}`, variants.length ? `Variant: ${variants.join(", ")}` : null]
    .filter(Boolean)
    .join(" | ");
}
