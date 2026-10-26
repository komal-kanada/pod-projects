-- One search function for every preset: vector, keyword or hybrid (RRF),
-- with metadata filters. Summary nodes are never returned here — they are
-- only searched by match_summaries, for routing.
create or replace function worldbank.hybrid_search (
  p_run_id uuid,
  query_text text,
  query_embedding extensions.vector(768),
  mode text default 'hybrid',
  candidate_pool integer default 30,
  rrf_k integer default 60,
  f_content_types text[] default null,
  f_regions text[] default null,
  f_countries text[] default null,
  f_years integer[] default null,
  f_chapter text default null,
  f_section_ids uuid[] default null
)
returns table (
  chunk_id uuid, section_id uuid, content_type text, title text, content text,
  section_path text[], chapter text, page_start int, page_end int,
  page_label_start text, page_label_end text, regions text[], countries text[], years int[],
  is_forecast boolean, token_count int, ordinal_in_section int,
  similarity double precision, vector_rank int, keyword_rank int, score double precision
)
language sql stable
set search_path = worldbank, extensions
as $$
  with base as (
    select c.* from worldbank.chunks c
    where c.run_id = p_run_id
      and c.content_type <> 'summary'
      and (f_content_types is null or c.content_type = any (f_content_types))
      -- Region-less chunks pass a region filter: global statements often
      -- apply to every region. They get a small penalty below.
      and (f_regions is null or c.regions && f_regions or c.regions = '{}')
      and (f_countries is null or c.countries && f_countries)
      and (f_years is null or c.years && f_years)
      and (f_chapter is null or c.chapter = f_chapter)
      and (f_section_ids is null or c.section_id = any (f_section_ids))
  ),
  vec as (
    select b.id, row_number() over (order by b.embedding <=> query_embedding) as rnk
    from base b
    where mode in ('vector', 'hybrid') and b.embedding is not null
    order by b.embedding <=> query_embedding
    limit candidate_pool
  ),
  kw as (
    select b.id, row_number() over (order by ts_rank_cd(b.content_tsv, q) desc) as rnk
    from base b, websearch_to_tsquery('english', query_text) q
    where mode in ('keyword', 'hybrid') and b.content_tsv @@ q
    order by ts_rank_cd(b.content_tsv, q) desc
    limit candidate_pool
  ),
  fused as (
    select coalesce(vec.id, kw.id) as id, vec.rnk as vr, kw.rnk as kr,
           coalesce(1.0 / (rrf_k + vec.rnk), 0) + coalesce(1.0 / (rrf_k + kw.rnk), 0) as s
    from vec full outer join kw on vec.id = kw.id
  )
  select c.id, c.section_id, c.content_type, c.title, c.content,
         c.section_path, c.chapter, c.page_start, c.page_end,
         c.page_label_start, c.page_label_end, c.regions, c.countries, c.years,
         c.is_forecast, c.token_count, c.ordinal_in_section,
         case when c.embedding is null then null else 1 - (c.embedding <=> query_embedding) end,
         f.vr::int, f.kr::int,
         (f.s - case when f_regions is not null and c.regions = '{}' then 0.002 else 0 end)::double precision
  from fused f join worldbank.chunks c on c.id = f.id
  order by 21 desc, f.vr nulls last
  limit candidate_pool;
$$;

-- B6 routing: which sections' summaries are closest to the question.
create or replace function worldbank.match_summaries (
  p_run_id uuid,
  query_embedding extensions.vector(768),
  match_count int default 4
)
returns table (section_id uuid, path text[], summary text, similarity double precision)
language sql stable
set search_path = worldbank, extensions
as $$
  select c.section_id, c.section_path, c.content, 1 - (c.embedding <=> query_embedding)
  from worldbank.chunks c
  where c.run_id = p_run_id and c.content_type = 'summary' and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
