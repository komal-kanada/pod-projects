# Database Schema

Supabase Postgres with pgvector. Four tables. RLS enabled on all with **no
policies**, so only the server (service role) can read or write.

```text
documents 1───* ingestion_runs 1───* chunks
                       │
                       └──────────* queries
```

## 0001_extensions.sql

```sql
create extension if not exists vector;
create extension if not exists pgcrypto;
```

## 0002_tables.sql

```sql
create table documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,                 -- "GPO Annual Report"
  filename    text not null,
  sha256      text not null unique,          -- same file never stored twice
  page_count  integer not null,
  created_at  timestamptz not null default now()
);

create table ingestion_runs (
  id                  uuid primary key default gen_random_uuid(),
  document_id         uuid not null references documents(id) on delete cascade,
  config_hash         text not null,
  config              jsonb not null,        -- full chunk + embedding config snapshot
  embedding_model     text not null,
  embedding_dims      integer not null,
  status              text not null default 'running'
                        check (status in ('running', 'completed', 'failed')),
  chunk_count         integer,
  stats               jsonb,                 -- avg/min/max chunk chars, pages w/o text, etc.
  is_active           boolean not null default false,
  notes               text,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz,
  unique (document_id, config_hash)
);

-- At most one active run.
create unique index ingestion_runs_one_active
  on ingestion_runs (is_active) where is_active;

create table chunks (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references ingestion_runs(id) on delete cascade,
  document_id   uuid not null references documents(id) on delete cascade,
  chunk_index   integer not null,            -- reading order within the run
  content       text not null,               -- clean text, shown + sent to the LLM
  embed_text    text not null,               -- contextual header + content, what was embedded
  section_path  text,                        -- "Financial Highlights › Revenue"
  page_start    integer not null,            -- PDF page index, 1-based
  page_end      integer not null,
  page_label_start text,                     -- printed label, if the PDF has labels
  page_label_end   text,
  char_count    integer not null,
  content_tsv   tsvector generated always as (to_tsvector('english', content)) stored,
  embedding     vector(768),
  created_at    timestamptz not null default now(),
  unique (run_id, chunk_index)
);

create table queries (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid references ingestion_runs(id) on delete set null,
  question            text not null,
  retrieval_mode      text not null,         -- 'vector' | 'hybrid'
  top_k               integer not null,
  retrieved           jsonb not null,        -- [{chunkId, rank, similarity, pageStart, pageEnd}]
  answer              text,
  citations           integer[],             -- valid [n] refs used
  invalid_citations   integer[],             -- [n] refs outside 1..k
  generation_model    text,
  latency_ms          integer,
  first_token_ms      integer,
  error               text,
  source              text not null default 'app',  -- 'app' | 'cli' | 'eval'
  created_at          timestamptz not null default now()
);
```

## 0003_indexes.sql

```sql
create index chunks_run_idx  on chunks (run_id);
create index chunks_page_idx on chunks (run_id, page_start, page_end);
create index chunks_tsv_idx  on chunks using gin (content_tsv);

-- A few hundred chunks don't need ANN; exact search is faster and more accurate.
-- Add this only if the chunk count grows past a few thousand.
-- create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);

create index queries_created_idx on queries (created_at desc);

alter table documents      enable row level security;
alter table ingestion_runs enable row level security;
alter table chunks         enable row level security;
alter table queries        enable row level security;
-- No policies: anon/authenticated roles can't touch anything. Server uses service role.
```

## 0004_search_functions.sql

```sql
create or replace function match_chunks (
  query_embedding vector(768),
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
set search_path = public
as $$
  select c.id, c.chunk_index, c.content, c.section_path,
         c.page_start, c.page_end, c.page_label_start, c.page_label_end,
         1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where c.run_id = p_run_id
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 50));
$$;
```

## 0005_hybrid_search.sql (Phase 6)

```sql
create or replace function hybrid_search (
  query_text text,
  query_embedding vector(768),
  p_run_id uuid,
  match_count integer default 6,
  candidate_pool integer default 20,
  rrf_k integer default 60
)
returns table (
  chunk_id uuid, chunk_index integer, content text, section_path text,
  page_start integer, page_end integer,
  page_label_start text, page_label_end text,
  similarity double precision,     -- cosine similarity (for display)
  vector_rank integer, keyword_rank integer,
  rrf_score double precision
)
language sql stable
set search_path = public
as $$
  with vec as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as rnk
    from chunks c
    where c.run_id = p_run_id and c.embedding is not null
    order by c.embedding <=> query_embedding
    limit candidate_pool
  ),
  kw as (
    select c.id,
           row_number() over (order by ts_rank_cd(c.content_tsv, q) desc) as rnk
    from chunks c, websearch_to_tsquery('english', query_text) q
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
         f.vector_rank::int, f.keyword_rank::int, f.rrf_score
  from fused f join chunks c on c.id = f.id
  order by f.rrf_score desc
  limit match_count;
$$;
```

## Activating a run

Done in `scripts/activate.ts` inside a transaction:

```sql
update ingestion_runs set is_active = false where is_active;
update ingestion_runs set is_active = true  where id = $1 and status = 'completed';
```
