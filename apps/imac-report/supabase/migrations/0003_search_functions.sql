-- Hybrid search over derived chunks: vector ⊕ keyword (on the units-
-- normalised fts column) fused with RRF, plus a small boost for chunk kinds
-- that suit the question (e.g. table rows and chart facts for numbers), and
-- a soft product-variant filter (variant-less chunks still pass).
create or replace function imac.hybrid_search_elements (
  p_run_id uuid,
  query_text text,
  query_embedding extensions.vector(768),
  mode text default 'hybrid',
  candidate_pool int default 30,
  rrf_k int default 60,
  boost_kinds text[] default null,
  boost double precision default 0.004,
  f_variants text[] default null
)
returns table (chunk_id uuid, element_id uuid, chunk_kind text, element_type text, content text,
               page_number int, section text, variants text[], similarity double precision,
               vector_rank int, keyword_rank int, score double precision)
language sql stable
set search_path = imac, extensions
as $$
  with base as (
    select c.* from imac.chunks c
    where c.run_id = p_run_id
      and (f_variants is null or c.variants && f_variants or c.variants = '{}')
  ),
  vec as (
    select b.id, row_number() over (order by b.embedding <=> query_embedding) rnk
    from base b
    where mode in ('vector', 'hybrid') and b.embedding is not null
    order by b.embedding <=> query_embedding limit candidate_pool
  ),
  kw as (
    select b.id, row_number() over (order by ts_rank_cd(b.fts_tsv, q) desc) rnk
    from base b, websearch_to_tsquery('english', query_text) q
    where mode in ('keyword', 'hybrid') and b.fts_tsv @@ q
    order by ts_rank_cd(b.fts_tsv, q) desc limit candidate_pool
  ),
  fused as (
    select coalesce(vec.id, kw.id) id, vec.rnk vr, kw.rnk kr,
           coalesce(1.0 / (rrf_k + vec.rnk), 0) + coalesce(1.0 / (rrf_k + kw.rnk), 0) s
    from vec full outer join kw on vec.id = kw.id
  )
  select c.id, c.element_id, c.chunk_kind, c.element_type, c.content, c.page_number, c.section, c.variants,
         case when c.embedding is null then null else 1 - (c.embedding <=> query_embedding) end,
         f.vr::int, f.kr::int,
         (f.s + case when boost_kinds is not null and c.chunk_kind = any (boost_kinds) then boost else 0 end)::double precision
  from fused f join imac.chunks c on c.id = f.id
  order by 12 desc, f.vr nulls last
  limit candidate_pool;
$$;
