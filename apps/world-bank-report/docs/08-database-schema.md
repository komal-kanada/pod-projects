# Database Schema

Supabase Postgres + pgvector. RLS enabled everywhere, no policies — server
uses the service role.

```text
documents 1─* ingestion_runs 1─* sections (tree via parent_id)
                     │                 1─* chunks
                     └──────────────────* queries
```

## 0001_extensions.sql

```sql
create extension if not exists vector;
create extension if not exists pgcrypto;
```

## 0002_tables.sql

```sql
create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  filename text not null,
  sha256 text not null unique,
  page_count integer not null,
  created_at timestamptz not null default now()
);

create table ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  kind text not null check (kind in ('flat:text', 'flat:markdown', 'hierarchical')),
  config_hash text not null,
  config jsonb not null,                 -- chunking, embedding, prompt versions
  embedding_model text not null,
  embedding_dims integer not null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  stats jsonb,                           -- counts per content_type, sections, fallback pages…
  is_active boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (document_id, config_hash)
);
create unique index ingestion_runs_one_active_per_kind
  on ingestion_runs (kind) where is_active;

create table sections (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ingestion_runs(id) on delete cascade,
  parent_id uuid references sections(id) on delete cascade,
  level integer not null,                -- 0 = report, 1 = chapter, …
  ordinal integer not null,              -- document order across the whole run
  title text not null,
  path text[] not null,                  -- ['Regional Outlooks','South Asia','Outlook']
  kind text not null,                    -- front_matter | chapter | section | box | appendix | references
  page_start integer not null,
  page_end integer not null,
  token_count integer not null,          -- own + descendants
  own_text text,                         -- concatenated text of direct blocks (for parent expansion)
  own_token_count integer not null default 0,
  regions text[] not null default '{}',  -- inherited region(s)
  retrievable boolean not null default true,  -- false for TOC, abbreviations, references
  summary text                           -- B6
);

create table chunks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ingestion_runs(id) on delete cascade,
  section_id uuid references sections(id) on delete cascade,  -- null for flat runs
  chunk_index integer not null,          -- document order in the run
  ordinal_in_section integer,
  content_type text not null check (content_type in ('flat','text','table','figure','box','summary')),
  title text,                            -- table/figure/box title
  content text not null,
  embed_text text not null,
  section_path text[],
  chapter text,
  page_start integer not null,
  page_end integer not null,
  page_label_start text,
  page_label_end text,
  regions text[] not null default '{}',
  countries text[] not null default '{}',
  years integer[] not null default '{}',
  is_forecast boolean not null default false,
  parse_source text not null default 'gemini',
  token_count integer not null,
  content_tsv tsvector generated always as
    (to_tsvector('english', coalesce(title,'') || ' ' || content)) stored,
  embedding vector(768),
  unique (run_id, chunk_index)
);

create table queries (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  preset text not null,
  run_ids uuid[] not null,
  analysis jsonb,
  trace jsonb not null,
  context_sources jsonb not null,        -- [{n, sectionId, chunkIds, pages, type, tokens}]
  answer text,
  citations integer[],
  invalid_citations integer[],
  tokens jsonb,                          -- {analysis, rerank, generation: {in,out}}
  latency_ms integer,
  first_token_ms integer,
  error text,
  source text not null default 'app',    -- app | cli | eval
  created_at timestamptz not null default now()
);
```

## 0003_indexes.sql

```sql
create index sections_run_idx      on sections (run_id, ordinal);
create index sections_parent_idx   on sections (parent_id);
create index chunks_run_type_idx   on chunks (run_id, content_type);
create index chunks_section_idx    on chunks (section_id, ordinal_in_section);
create index chunks_page_idx       on chunks (run_id, page_start, page_end);
create index chunks_tsv_idx        on chunks using gin (content_tsv);
create index chunks_regions_idx    on chunks using gin (regions);
create index chunks_countries_idx  on chunks using gin (countries);
create index chunks_years_idx      on chunks using gin (years);
-- ~2.5k vectors: exact scan is fine. Enable if it grows:
-- create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);

alter table documents      enable row level security;
alter table ingestion_runs enable row level security;
alter table sections       enable row level security;
alter table chunks         enable row level security;
alter table queries        enable row level security;
```

## 0004_search_functions.sql

### `hybrid_search` — vector, keyword or hybrid, with filters

```sql
create or replace function hybrid_search (
  p_run_id uuid,
  query_text text,
  query_embedding vector(768),
  mode text default 'hybrid',                 -- 'vector' | 'keyword' | 'hybrid'
  candidate_pool integer default 30,
  rrf_k integer default 60,
  f_content_types text[] default null,        -- null = all except summary
  f_regions text[] default null,
  f_countries text[] default null,
  f_years integer[] default null,
  f_chapter text default null,
  f_section_ids uuid[] default null           -- summary routing restriction (descendants pre-resolved)
)
returns table (
  chunk_id uuid, section_id uuid, content_type text, title text, content text,
  section_path text[], page_start int, page_end int, page_label_start text, page_label_end text,
  regions text[], years int[], similarity double precision,
  vector_rank int, keyword_rank int, score double precision
)
language sql stable set search_path = public
as $$
  with base as (
    select c.* from chunks c
    where c.run_id = p_run_id
      and c.content_type <> 'summary'
      and (f_content_types is null or c.content_type = any (f_content_types))
      and (f_regions   is null or c.regions && f_regions or c.regions = '{}')
      and (f_countries is null or c.countries && f_countries)
      and (f_years     is null or c.years && f_years)
      and (f_chapter   is null or c.chapter = f_chapter)
      and (f_section_ids is null or c.section_id = any (f_section_ids))
  ),
  vec as (
    select id, row_number() over (order by embedding <=> query_embedding) as rnk
    from base where mode in ('vector','hybrid') and embedding is not null
    order by embedding <=> query_embedding limit candidate_pool
  ),
  kw as (
    select b.id, row_number() over (order by ts_rank_cd(b.content_tsv, q) desc) as rnk
    from base b, websearch_to_tsquery('english', query_text) q
    where mode in ('keyword','hybrid') and b.content_tsv @@ q
    order by ts_rank_cd(b.content_tsv, q) desc limit candidate_pool
  ),
  fused as (
    select coalesce(vec.id, kw.id) as id, vec.rnk as vr, kw.rnk as kr,
           coalesce(1.0/(rrf_k + vec.rnk), 0) + coalesce(1.0/(rrf_k + kw.rnk), 0)
             -- small penalty for region-less chunks admitted by a region filter
             - case when f_regions is not null and b.regions = '{}' then 0.002 else 0 end as score
    from vec full outer join kw on vec.id = kw.id
    join base b on b.id = coalesce(vec.id, kw.id)
  )
  select c.id, c.section_id, c.content_type, c.title, c.content, c.section_path,
         c.page_start, c.page_end, c.page_label_start, c.page_label_end,
         c.regions, c.years, 1 - (c.embedding <=> query_embedding),
         f.vr::int, f.kr::int, f.score
  from fused f join chunks c on c.id = f.id
  order by f.score desc
  limit candidate_pool;
$$;
```

### `match_summaries` — B6 routing

```sql
create or replace function match_summaries (
  p_run_id uuid, query_embedding vector(768), match_count int default 4
)
returns table (section_id uuid, path text[], summary text, similarity double precision)
language sql stable set search_path = public
as $$
  select c.section_id, c.section_path, c.content, 1 - (c.embedding <=> query_embedding)
  from chunks c
  where c.run_id = p_run_id and c.content_type = 'summary'
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
```

## 0005_context_functions.sql

### `section_descendants` — for routing restriction

```sql
create or replace function section_descendants (root_ids uuid[])
returns table (id uuid)
language sql stable set search_path = public
as $$
  with recursive t as (
    select s.id from sections s where s.id = any (root_ids)
    union all
    select s.id from sections s join t on s.parent_id = t.id
  )
  select id from t;
$$;
```

### `get_section_children` — for small-to-big windows

```sql
create or replace function get_section_children (p_section_ids uuid[])
returns table (chunk_id uuid, section_id uuid, ordinal_in_section int,
               content_type text, content text, token_count int,
               page_start int, page_end int)
language sql stable set search_path = public
as $$
  select id, section_id, ordinal_in_section, content_type, content, token_count, page_start, page_end
  from chunks
  where section_id = any (p_section_ids) and content_type in ('text','table','figure','box')
  order by section_id, ordinal_in_section;
$$;
```

Window construction and budget logic happen in TypeScript (`context.ts`) on the
rows returned — easier to test than SQL.
