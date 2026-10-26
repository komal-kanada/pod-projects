-- Vector search (the baseline): cosine distance over the given run.
create or replace function gpo.match_chunks (
  query_embedding extensions.vector(768),
  p_run_id uuid,
  match_count integer default 6
)
returns table (
  chunk_id uuid, chunk_index integer, content text, section_path text,
  page_start integer, page_end integer,
  page_label_start text, page_label_end text,
  similarity double precision
)
language sql stable
set search_path = gpo, extensions
as $$
  select c.id, c.chunk_index, c.content, c.section_path,
         c.page_start, c.page_end, c.page_label_start, c.page_label_end,
         1 - (c.embedding <=> query_embedding) as similarity
  from gpo.chunks c
  where c.run_id = p_run_id
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 50));
$$;

-- Hybrid search (experiment E4): keyword (full-text) and vector rankings
-- fused with Reciprocal Rank Fusion. Annual reports are full of exact tokens
-- — fiscal years, dollar figures, program names — that embeddings blur.
create or replace function gpo.hybrid_search (
  query_text text,
  query_embedding extensions.vector(768),
  p_run_id uuid,
  match_count integer default 6,
  candidate_pool integer default 20,
  rrf_k integer default 60
)
returns table (
  chunk_id uuid, chunk_index integer, content text, section_path text,
  page_start integer, page_end integer,
  page_label_start text, page_label_end text,
  similarity double precision,
  vector_rank integer, keyword_rank integer,
  rrf_score double precision
)
language sql stable
set search_path = gpo, extensions
as $$
  with vec as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as rnk
    from gpo.chunks c
    where c.run_id = p_run_id and c.embedding is not null
    order by c.embedding <=> query_embedding
    limit candidate_pool
  ),
  kw as (
    select c.id, row_number() over (order by ts_rank_cd(c.content_tsv, q) desc) as rnk
    from gpo.chunks c, websearch_to_tsquery('english', query_text) q
    where c.run_id = p_run_id and c.content_tsv @@ q
    order by ts_rank_cd(c.content_tsv, q) desc
    limit candidate_pool
  ),
  fused as (
    select coalesce(vec.id, kw.id) as id,
           vec.rnk as vector_rank, kw.rnk as keyword_rank,
           coalesce(1.0 / (rrf_k + vec.rnk), 0) + coalesce(1.0 / (rrf_k + kw.rnk), 0) as rrf_score
    from vec full outer join kw on vec.id = kw.id
  )
  select c.id, c.chunk_index, c.content, c.section_path,
         c.page_start, c.page_end, c.page_label_start, c.page_label_end,
         1 - (c.embedding <=> query_embedding),
         f.vector_rank::int, f.keyword_rank::int, f.rrf_score::double precision
  from fused f join gpo.chunks c on c.id = f.id
  order by f.rrf_score desc, f.vector_rank nulls last
  limit greatest(1, least(match_count, 50));
$$;
