import type { Sql } from "@pod/db";
import { flattenTree } from "../structure/tree";
import type { SectionInfo } from "../retrieval/context";
import type { Block, SectionNode } from "../types";

/** The section tree of a hierarchical run: stored flat with parent ids. */

function ownText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case "paragraph":
          return block.text;
        case "list":
          return block.items.map((item) => `- ${item}`).join("\n");
        case "table":
          return [block.caption, block.markdown, block.notes].filter(Boolean).join("\n");
        case "figure":
          return `Figure: ${block.title}\n${block.description}`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

export async function insertSections(
  sql: Sql,
  runId: string,
  root: SectionNode,
  ids: Map<string, string>,
  summaries: Map<string, string>,
) {
  const parentOf = new Map<string, string | null>();
  const walk = (node: SectionNode, parent: string | null) => {
    parentOf.set(node.key, parent);
    node.children.forEach((child) => walk(child, node.key));
  };
  walk(root, null);

  const rows = flattenTree(root).map((node) => {
    const parentKey = parentOf.get(node.key);
    return {
      id: ids.get(node.key)!,
      parent_id: parentKey ? ids.get(parentKey)! : null,
      level: node.level,
      ordinal: node.ordinal,
      title: node.title,
      path: node.path,
      kind: node.kind,
      page_start: node.pageStart,
      page_end: node.pageEnd,
      token_count: node.tokenCount,
      own_text: ownText(node.blocks) || null,
      own_token_count: node.ownTokenCount,
      regions: node.regions,
      retrievable: node.retrievable,
      summary: summaries.get(node.key) ?? null,
    };
  });

  // Parents before children (document order guarantees it), in batches.
  for (let start = 0; start < rows.length; start += 100) {
    await sql`
      insert into worldbank.sections (id, run_id, parent_id, level, ordinal, title, path, kind, page_start, page_end,
        token_count, own_text, own_token_count, regions, retrievable, summary)
      select r.id, ${runId}::uuid, r.parent_id, r.level, r.ordinal, r.title, r.path, r.kind, r.page_start, r.page_end,
             r.token_count, r.own_text, r.own_token_count, r.regions, r.retrievable, r.summary
      from json_to_recordset(${sql.json(rows.slice(start, start + 100) as never)}::json) as r(
        id uuid, parent_id uuid, level int, ordinal int, title text, path text[], kind text,
        page_start int, page_end int, token_count int, own_text text, own_token_count int,
        regions text[], retrievable boolean, summary text
      )
    `;
  }
}

export interface SectionRow {
  id: string;
  parentId: string | null;
  level: number;
  ordinal: number;
  title: string;
  path: string[];
  kind: string;
  pageStart: number;
  pageEnd: number;
  tokenCount: number;
  ownTokenCount: number;
  regions: string[];
  retrievable: boolean;
  summary: string | null;
  chunkCount: number;
}

export async function listSections(sql: Sql, runId: string): Promise<SectionRow[]> {
  const rows = await sql<
    {
      id: string; parent_id: string | null; level: number; ordinal: number; title: string; path: string[];
      kind: string; page_start: number; page_end: number; token_count: number; own_token_count: number;
      regions: string[]; retrievable: boolean; summary: string | null; chunk_count: number;
    }[]
  >`
    select s.id, s.parent_id, s.level, s.ordinal, s.title, s.path, s.kind, s.page_start, s.page_end,
           s.token_count, s.own_token_count, s.regions, s.retrievable, s.summary,
           (select count(*)::int from worldbank.chunks c where c.section_id = s.id and c.content_type <> 'summary') as chunk_count
    from worldbank.sections s
    where s.run_id = ${runId}
    order by s.ordinal
  `;
  return rows.map((r) => ({
    id: r.id, parentId: r.parent_id, level: r.level, ordinal: r.ordinal, title: r.title, path: r.path,
    kind: r.kind, pageStart: r.page_start, pageEnd: r.page_end, tokenCount: r.token_count,
    ownTokenCount: r.own_token_count, regions: r.regions, retrievable: r.retrievable,
    summary: r.summary, chunkCount: r.chunk_count,
  }));
}

/** What context assembly needs to know about the sections it expands into. */
export async function sectionInfo(sql: Sql, ids: string[]): Promise<Map<string, SectionInfo>> {
  if (ids.length === 0) return new Map();
  const rows = await sql<
    { id: string; path: string[]; title: string; ordinal: number; own_text: string | null; own_token_count: number; page_start: number; page_end: number }[]
  >`
    select id, path, title, ordinal, own_text, own_token_count, page_start, page_end
    from worldbank.sections where id = any(${ids}::uuid[])
  `;
  return new Map(
    rows.map((r) => [
      r.id,
      { id: r.id, path: r.path, title: r.title, ordinal: r.ordinal, ownText: r.own_text, ownTokenCount: r.own_token_count, pageStart: r.page_start, pageEnd: r.page_end },
    ]),
  );
}

export async function chapterTitles(sql: Sql, runId: string): Promise<string[]> {
  const rows = await sql<{ title: string }[]>`
    select title from worldbank.sections where run_id = ${runId} and level = 1 and retrievable order by ordinal
  `;
  return rows.map((r) => r.title);
}

export async function sectionDescendants(sql: Sql, rootIds: string[]): Promise<string[]> {
  if (rootIds.length === 0) return [];
  const rows = await sql<{ id: string }[]>`select id from worldbank.section_descendants(${rootIds}::uuid[])`;
  return rows.map((r) => r.id);
}
