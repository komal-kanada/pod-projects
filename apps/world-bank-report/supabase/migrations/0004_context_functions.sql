-- A section and everything under it — for summary-routing restrictions.
create or replace function worldbank.section_descendants (root_ids uuid[])
returns table (id uuid)
language sql stable
set search_path = worldbank, extensions
as $$
  with recursive t as (
    select s.id from worldbank.sections s where s.id = any (root_ids)
    union
    select s.id from worldbank.sections s join t on s.parent_id = t.id
  )
  select id from t;
$$;

-- All retrievable chunks of the given sections, in order — the raw material
-- for small-to-big windows. Window and budget logic live in TypeScript
-- (lib/retrieval/context.ts), where they are easy to test.
create or replace function worldbank.get_section_children (p_section_ids uuid[])
returns table (chunk_id uuid, section_id uuid, ordinal_in_section int, content_type text,
               title text, content text, token_count int, page_start int, page_end int,
               page_label_start text, page_label_end text)
language sql stable
set search_path = worldbank, extensions
as $$
  select id, section_id, ordinal_in_section, content_type, title, content, token_count,
         page_start, page_end, page_label_start, page_label_end
  from worldbank.chunks
  where section_id = any (p_section_ids) and content_type in ('text', 'table', 'figure', 'box')
  order by section_id, ordinal_in_section;
$$;
