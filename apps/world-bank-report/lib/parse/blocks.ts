import type { Nodes, Root, RootContent, Table } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { Block, Footnote } from "../types";

/**
 * Markdown → typed blocks (04 §5): heading, paragraph, list, table, figure,
 * box, footnote. Then pages are stitched: a paragraph or table that runs over
 * a page break becomes one block, and footnotes attach to the block that
 * carries their marker so a claim and its caveat travel together.
 */

const processor = unified().use(remarkParse).use(remarkGfm);

function plainText(node: Nodes): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node) return (node.children as Nodes[]).map(plainText).join("");
  return "";
}

function slice(source: string, node: RootContent): string {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? plainText(node) : source.slice(start, end);
}

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i")) ?? tag.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, "i"));
  return match?.[1]?.trim() ?? "";
}

function tableBlock(node: Table, source: string, page: number): Extract<Block, { kind: "table" }> {
  const rows = node.children.map((row) => row.children.map((cell) => plainText(cell).trim()));
  return {
    kind: "table",
    markdown: slice(source, node).trim(),
    header: rows[0] ?? [],
    rowLabels: rows.slice(1).map((row) => row[0] ?? "").filter(Boolean),
    rows: Math.max(0, rows.length - 1),
    page,
  };
}

/** One page of Gemini markdown → blocks in reading order. */
export function parsePageBlocks(markdown: string, page: number): Block[] {
  // Custom tags first, replaced by placeholders so remark sees plain markdown.
  const extracted: Block[] = [];
  const placeholder = (block: Block) => {
    extracted.push(block);
    return `\n\n@@BLOCK${extracted.length - 1}@@\n\n`;
  };

  let source = markdown.replace(/<box\b([^>]*)>([\s\S]*?)<\/box>/gi, (_, attrs: string, inner: string) =>
    placeholder({ kind: "box", title: attr(attrs, "title") || "Box", blocks: parsePageBlocks(inner, page), page }),
  );
  source = source.replace(/<figure\b([^>]*)>([\s\S]*?)<\/figure>/gi, (_, attrs: string, inner: string) => {
    const text = inner.trim();
    const sourceLine = text.match(/(?:^|\n)\s*Source[s]?:\s*(.+)$/i)?.[1];
    return placeholder({
      kind: "figure",
      title: attr(attrs, "title") || "Figure",
      description: sourceLine ? text.replace(/(?:^|\n)\s*Source[s]?:.+$/i, "").trim() : text,
      source: sourceLine?.trim(),
      page,
    });
  });
  source = source.replace(/<footnote\b([^>]*)>([\s\S]*?)<\/footnote>/gi, (_, attrs: string, inner: string) =>
    placeholder({ kind: "footnote", n: attr(attrs, "n") || "*", text: inner.trim(), page }),
  );

  const tree = processor.parse(source) as Root;
  const blocks: Block[] = [];
  let pendingCaption: string | undefined;

  for (const node of tree.children) {
    if (node.type === "heading") {
      blocks.push({ kind: "heading", level: node.depth, text: plainText(node).trim(), page });
      continue;
    }
    if (node.type === "table") {
      const table = tableBlock(node, source, page);
      if (pendingCaption) table.caption = pendingCaption;
      pendingCaption = undefined;
      blocks.push(table);
      continue;
    }
    if (node.type === "list") {
      blocks.push({
        kind: "list",
        items: node.children.map((item) => slice(source, item).replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim()),
        page,
      });
      continue;
    }
    if (node.type === "thematicBreak" || node.type === "definition") continue;

    const text = slice(source, node).trim();
    if (!text) continue;

    const ref = text.match(/^@@BLOCK(\d+)@@$/);
    if (ref) {
      blocks.push(extracted[Number(ref[1])]);
      continue;
    }

    const caption = text.match(/^Table:\s*(.+)$/is);
    if (caption) {
      pendingCaption = caption[1].replace(/\s+/g, " ").trim();
      continue;
    }

    const notes = text.match(/^(?:Notes?|Sources?):\s*/i);
    const previous = blocks.at(-1);
    if (notes && previous?.kind === "table") {
      previous.notes = previous.notes ? `${previous.notes}\n${text}` : text;
      continue;
    }

    blocks.push({ kind: "paragraph", text: node.type === "html" ? text.replace(/<[^>]+>/g, "").trim() : text, page });
  }

  // A caption with no table after it is just a line of text.
  if (pendingCaption) blocks.push({ kind: "paragraph", text: `Table: ${pendingCaption}`, page });

  return attachFootnotes(blocks);
}

const SUPERSCRIPTS: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

function markerPatterns(n: string): RegExp[] {
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sup = n.split("").map((digit) => SUPERSCRIPTS[digit] ?? digit).join("");
  return [
    new RegExp(`\\^${escaped}(?!\\d)`),
    new RegExp(`<sup>\\s*${escaped}\\s*</sup>`, "i"),
    new RegExp(`\\[\\^?${escaped}\\]`),
    ...(sup !== n ? [new RegExp(`${sup}(?![⁰¹²³⁴⁵⁶⁷⁸⁹])`)] : []),
  ];
}

function blockText(block: Block): string {
  switch (block.kind) {
    case "paragraph":
      return block.text;
    case "list":
      return block.items.join("\n");
    case "table":
      return `${block.caption ?? ""}\n${block.markdown}\n${block.notes ?? ""}`;
    default:
      return "";
  }
}

/** Footnotes attach to the block holding their marker; orphans become paragraphs. */
export function attachFootnotes(blocks: Block[]): Block[] {
  const footnotes = blocks.filter((block): block is Extract<Block, { kind: "footnote" }> => block.kind === "footnote");
  if (footnotes.length === 0) return blocks;

  const attached = new Set<Block>();
  for (const footnote of footnotes) {
    const patterns = markerPatterns(footnote.n);
    const host = blocks.find(
      (block) => (block.kind === "paragraph" || block.kind === "list" || block.kind === "table") && patterns.some((p) => p.test(blockText(block))),
    ) as Extract<Block, { kind: "paragraph" | "list" | "table" }> | undefined;
    if (host) {
      const note: Footnote = { n: footnote.n, text: footnote.text };
      host.footnotes = [...(host.footnotes ?? []), note];
      attached.add(footnote);
    }
  }

  return blocks.flatMap((block): Block[] => {
    if (block.kind !== "footnote") return [block];
    if (attached.has(block)) return [];
    return [{ kind: "paragraph", text: `Note ${block.n}: ${block.text}`, page: block.page }];
  });
}

/** Fallback pages: the text layer split into paragraphs (no structure). */
export function textLayerBlocks(text: string, page: number): Block[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.replace(/\n/g, " ").trim())
    .filter((part) => part.length > 0)
    .map((part) => ({ kind: "paragraph" as const, text: part, page }));
}

const ENDS_SENTENCE = /[.!?:;"”’)\]]$/;

/**
 * Stitches pages together: a paragraph that ends mid-sentence continues on
 * the next page; a table whose header repeats on the next page is one table;
 * a box with the same title continues. Paragraphs don't run on into a page
 * in `sectionStarts` (pages where the outline opens a new section).
 */
export function joinPages(pages: Block[][], sectionStarts: ReadonlySet<number> = new Set()): Block[] {
  const out: Block[] = [];

  for (const blocks of pages) {
    blocks.forEach((block, index) => {
      const previous = out.at(-1);
      if (index === 0 && previous) {
        if (
          previous.kind === "paragraph" &&
          block.kind === "paragraph" &&
          !sectionStarts.has(block.page) &&
          !ENDS_SENTENCE.test(previous.text.trim()) &&
          !/^@@/.test(block.text)
        ) {
          previous.text = `${previous.text.trim()} ${block.text.trim()}`;
          previous.pageEnd = block.page;
          if (block.footnotes) previous.footnotes = [...(previous.footnotes ?? []), ...block.footnotes];
          return;
        }
        if (
          previous.kind === "table" &&
          block.kind === "table" &&
          previous.header.join("|") === block.header.join("|") &&
          (!block.caption || block.caption === previous.caption)
        ) {
          const body = block.markdown.split("\n").slice(2).join("\n");
          previous.markdown = `${previous.markdown}\n${body}`;
          previous.rowLabels = [...previous.rowLabels, ...block.rowLabels];
          previous.rows += block.rows;
          previous.pageEnd = block.page;
          if (block.notes) previous.notes = previous.notes ? `${previous.notes}\n${block.notes}` : block.notes;
          return;
        }
        if (previous.kind === "box" && block.kind === "box" && previous.title === block.title) {
          previous.blocks.push(...block.blocks);
          previous.pageEnd = block.page;
          return;
        }
      }
      out.push(block);
    });
  }

  return out;
}
