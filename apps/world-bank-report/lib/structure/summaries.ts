import type { Gemini } from "@pod/ai";
import { mapWithConcurrency } from "@pod/rag/concurrency";
import { createDiskCache } from "@pod/rag/disk-cache";
import { sha256 } from "@pod/rag/hash";
import { leafSummaryPrompt, parentSummaryPrompt, SUMMARY_PROMPT_VERSION } from "../prompts";
import type { Block, SectionNode } from "../types";
import { PATH_SEPARATOR } from "../types";
import { flattenTree } from "./tree";

/**
 * Section and chapter summaries, bottom-up (05 §5, preset B6): leaves are
 * summarised from their own text, parents from their children's summaries,
 * and the report from its chapters.
 *
 * Summaries are generated text, so they are used only to *route* broad
 * questions to the right sections and to describe sections in the Document
 * Map — never as citable evidence. Cached by section text + prompt version.
 */
function blockText(block: Block): string {
  switch (block.kind) {
    case "paragraph":
      return block.text;
    case "list":
      return block.items.map((item) => `- ${item}`).join("\n");
    case "table":
      return `${block.caption ?? "Table"}\n${block.markdown}`;
    case "figure":
      return `Figure: ${block.title}. ${block.description}`;
    default:
      return "";
  }
}

export async function summariseTree(
  gemini: Gemini,
  root: SectionNode,
  { cacheDir, log = console.log }: { cacheDir: string; log?: (line: string) => void },
): Promise<Map<string, string>> {
  const cache = createDiskCache(`${cacheDir}/summaries`);
  const summaries = new Map<string, string>();
  const nodes = flattenTree(root).filter((node) => node.retrievable && node.tokenCount > 40);

  // Deepest first, so every parent sees its children's summaries.
  const byDepth = new Map<number, SectionNode[]>();
  for (const node of nodes) byDepth.set(node.level, [...(byDepth.get(node.level) ?? []), node]);
  const depths = [...byDepth.keys()].sort((a, b) => b - a);

  let done = 0;
  for (const depth of depths) {
    await mapWithConcurrency(byDepth.get(depth)!, 3, async (node) => {
      const breadcrumb = node.level === 0 ? "Whole report" : node.path.join(PATH_SEPARATOR);
      const pages = node.pageStart === node.pageEnd ? String(node.pageStart) : `${node.pageStart}–${node.pageEnd}`;
      const own = node.blocks.map(blockText).filter(Boolean).join("\n\n").slice(0, 24000);
      const children = node.children
        .map((child) => summaries.get(child.key) && `## ${child.title}\n${summaries.get(child.key)}`)
        .filter(Boolean)
        .join("\n\n");

      const prompt = children
        ? parentSummaryPrompt(breadcrumb, pages, own ? `${children}\n\n## (own text)\n${own.slice(0, 6000)}` : children)
        : leafSummaryPrompt(breadcrumb, pages, own);
      if (!own && !children) return;

      const key = `${node.key}-${sha256(prompt).slice(0, 16)}-${SUMMARY_PROMPT_VERSION}`;
      const cached = await cache.get<{ summary: string }>(key);
      if (cached) {
        summaries.set(node.key, cached.summary);
      } else {
        try {
          const summary = await gemini.generateText({ prompt, temperature: 0.2, maxOutputTokens: 400 });
          summaries.set(node.key, summary);
          await cache.set(key, { summary });
        } catch (error) {
          log(`  summary for "${breadcrumb}" failed: ${(error as Error).message}`);
        }
      }
      done += 1;
      if (done % 10 === 0) log(`  summarised ${done}/${nodes.length}`);
    });
  }
  return summaries;
}
