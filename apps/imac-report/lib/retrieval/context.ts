import { estimateTokens } from "@pod/rag/tokens";
import type { ElementSource } from "../types";
import type { ExpandedElement } from "./expand";

/**
 * Elements → numbered <source> blocks within the token budget (06 §7);
 * tables and charts are all-or-nothing. In M4 the top chart/table crops go
 * along as images, each introduced by "Image for source n:".
 */
function attr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function markHitRows(markdown: string, rows: number[]): string {
  if (rows.length === 0) return markdown;
  const lines = markdown.split("\n");
  const tableStart = lines.findIndex((line) => line.startsWith("| ---") || /^\|\s*-{3}/.test(line));
  if (tableStart === -1) return markdown;
  return lines.map((line, i) => (i > tableStart && rows.includes(i - tableStart - 1) ? `${line} ← matched` : line)).join("\n");
}

export function buildSources(items: ExpandedElement[], { budget, maxImages, images }: { budget: number; maxImages: number; images: boolean }) {
  const sources: ElementSource[] = [];
  const dropped: string[] = [];
  let used = 0;

  for (const item of items) {
    const element = item.element;
    const body = element
      ? markHitRows(element.markdown ?? element.text ?? "", item.hitRows)
      : item.flat!.content;
    const notes = item.footnotes.length ? `\nNotes: ${item.footnotes.map((f) => `[${f.marker}] ${f.text}`).join(" ")}` : "";
    const text = body + notes;
    const tokens = estimateTokens(text);
    if (used + tokens > budget) {
      dropped.push(element?.title ?? element?.type ?? `page ${item.flat?.page}`);
      continue;
    }
    used += tokens;
    sources.push({
      n: sources.length + 1,
      elementId: element?.id ?? null,
      type: element?.type ?? "flat",
      page: element?.page ?? item.flat!.page,
      title: element?.title ?? null,
      section: element?.section ?? item.flat?.section ?? null,
      text,
      tokens,
      hitRows: item.hitRows,
      data: element?.data ?? null,
      footnotes: item.footnotes,
      cropPath: element?.cropPath ?? null,
      imageAttached: false,
      referencedBy: item.referencedBy ?? null,
      chunkIds: item.chunkIds,
      score: item.score,
    });
  }

  const imageList: { n: number; path: string }[] = [];
  if (images) {
    for (const source of sources) {
      if (imageList.length >= maxImages) break;
      if ((source.type === "chart" || source.type === "table") && source.cropPath) {
        source.imageAttached = true;
        imageList.push({ n: source.n, path: source.cropPath });
      }
    }
  }

  const contextText = sources
    .map((s) => {
      const title = s.title ? ` title="${attr(s.title)}"` : "";
      const section = s.section ? ` section="${attr(s.section)}"` : "";
      const label = s.type === "flat" ? "page text" : s.type;
      return `<source id="${s.n}" type="${label}" page="${s.page}"${title}${section}>\n${s.text.replace(/<\/source>/gi, "</ source>")}\n</source>`;
    })
    .join("\n");

  return { sources, contextText, images: imageList, stats: { tokens: used, budget, dropped } };
}
