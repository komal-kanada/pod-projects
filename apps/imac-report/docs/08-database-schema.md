# Database Schema

Supabase Postgres + pgvector. RLS on, no policies; server uses the service role.
Images are files in `public/report/` (D10), referenced by path.

```text
documents 1─* ingestion_runs 1─* pages 1─* elements 1─* chunks
                                         elements *─* elements  (footnote_links)
ingestion_runs 1─* queries
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
  strategy text not null,                     -- X0 | X1 | X2 | X3
  representation text not null,               -- flat | typed
  config_hash text not null,
  config jsonb not null,                      -- prompts versions, DPI, chunk sizes, overrides applied
  embedding_model text not null,
  embedding_dims integer not null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  stats jsonb,                                -- element counts per type, fidelity flags, unresolved markers
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (document_id, config_hash)
);
-- one active run per (strategy, representation) so all presets work side by side
create unique index ingestion_runs_active
  on ingestion_runs (strategy, representation) where is_active;

create table pages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ingestion_runs(id) on delete cascade,
  page_number integer not null,
  image_path text not null,                   -- /report/pages/page-03.png
  width integer not null,
  height integer not null,
  unique (run_id, page_number)
);

create table elements (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ingestion_runs(id) on delete cascade,
  page_id uuid not null references pages(id) on delete cascade,
  page_number integer not null,
  reading_order integer not null,
  type text not null check (type in ('heading','text','table','chart','footnote','callout','image')),
  bbox integer[4],                            -- [ymin,xmin,ymax,xmax] 0–1000 (null for X0 when unknown)
  crop_path text,                             -- /report/crops/<id>.png for table/chart/callout
  title text,
  section text,
  text text,                                  -- text / footnote / callout text
  data jsonb,                                 -- table {columns, rows, unit} | chart {chartType, series…}
  markdown text,                              -- LLM-facing rendering
  marker text,                                -- footnotes only
  fidelity jsonb,                             -- {checked, numericPrecision, flags[]}
  overridden boolean not null default false
);

create table footnote_links (
  element_id uuid not null references elements(id) on delete cascade,
  footnote_id uuid not null references elements(id) on delete cascade,
  marker text not null,
  primary key (element_id, footnote_id)
);

create table chunks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ingestion_runs(id) on delete cascade,
  element_id uuid references elements(id) on delete cascade,   -- null for flat runs
  chunk_kind text not null check (chunk_kind in
    ('flat','text','table_summary','table_row','chart_summary','chart_fact','footnote','callout','image')),
  element_type text,
  content text not null,                      -- display text
  embed_text text not null,                   -- header + content
  fts_text text not null,                     -- normalised units, for keyword search
  page_number integer not null,
  section text,
  variants text[] not null default '{}',
  phases text[] not null default '{}',
  units text[] not null default '{}',
  has_numbers boolean not null default false,
  ordinal integer not null,
  fts_tsv tsvector generated always as (to_tsvector('english', fts_text)) stored,
  embedding vector(768),
  visual_embedding vector(1024)               -- M5 only; dims depend on provider
);

create table queries (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  preset text not null,
  run_id uuid references ingestion_runs(id) on delete set null,
  analysis jsonb,
  trace jsonb not null,
  sources jsonb not null,                     -- [{n, elementId, type, page, title, images:boolean}]
  answer text,
  citations integer[],
  invalid_citations integer[],
  disagreements text,                         -- model-reported image vs extraction mismatch
  tokens jsonb,
  latency_ms integer,
  first_token_ms integer,
  error text,
  source text not null default 'app',
  created_at timestamptz not null default now()
);
```

## 0003_indexes.sql

```sql
create index elements_run_page_idx on elements (run_id, page_number, reading_order);
create index elements_type_idx     on elements (run_id, type);
create index chunks_run_kind_idx   on chunks (run_id, chunk_kind);
create index chunks_element_idx    on chunks (element_id);
create index chunks_fts_idx        on chunks using gin (fts_tsv);
create index chunks_variants_idx   on chunks using gin (variants);

alter table documents      enable row level security;
alter table ingestion_runs enable row level security;
alter table pages          enable row level security;
alter table elements       enable row level security;
alter table footnote_links enable row level security;
alter table chunks         enable row level security;
alter table queries        enable row level security;
```

## 0004_search_functions.sql

```sql
create or replace function hybrid_search_elements (
  p_run_id uuid,
  query_text text,                  -- already glossary-expanded, websearch syntax
  query_embedding vector(768),
  mode text default 'hybrid',
  candidate_pool int default 30,
  rrf_k int default 60,
  boost_kinds text[] default null,  -- e.g. {table_row, chart_fact, callout}
  boost double precision default 0.004,
  f_variants text[] default null
)
returns table (chunk_id uuid, element_id uuid, chunk_kind text, element_type text,
               content text, page_number int, similarity double precision,
               vector_rank int, keyword_rank int, score double precision)
language sql stable set search_path = public
as $$
  with base as (
    select * from chunks c
    where c.run_id = p_run_id
      and (f_variants is null or c.variants && f_variants or c.variants = '{}')
  ),
  vec as (
    select id, row_number() over (order by embedding <=> query_embedding) rnk
    from base where mode in ('vector','hybrid')
    order by embedding <=> query_embedding limit candidate_pool
  ),
  kw as (
    select b.id, row_number() over (order by ts_rank_cd(b.fts_tsv, q) desc) rnk
    from base b, websearch_to_tsquery('english', query_text) q
    where mode in ('keyword','hybrid') and b.fts_tsv @@ q
    order by ts_rank_cd(b.fts_tsv, q) desc limit candidate_pool
  ),
  fused as (
    select coalesce(vec.id, kw.id) id, vec.rnk vr, kw.rnk kr,
           coalesce(1.0/(rrf_k+vec.rnk),0) + coalesce(1.0/(rrf_k+kw.rnk),0) s
    from vec full outer join kw on vec.id = kw.id
  )
  select c.id, c.element_id, c.chunk_kind, c.element_type, c.content, c.page_number,
         1 - (c.embedding <=> query_embedding), f.vr::int, f.kr::int,
         f.s + case when boost_kinds is not null and c.chunk_kind = any (boost_kinds)
                    then boost else 0 end as score
  from fused f join chunks c on c.id = f.id
  order by score desc
  limit candidate_pool;
$$;
```

## 0005_element_functions.sql

```sql
-- Elements + their linked footnotes, for context assembly
create or replace function get_elements_with_footnotes (p_element_ids uuid[])
returns table (element jsonb, footnotes jsonb)
language sql stable set search_path = public
as $$
  select to_jsonb(e) - 'fidelity',
         coalesce(jsonb_agg(jsonb_build_object('marker', l.marker, 'text', f.text, 'id', f.id))
                  filter (where f.id is not null), '[]')
  from elements e
  left join footnote_links l on l.element_id = e.id
  left join elements f on f.id = l.footnote_id
  where e.id = any (p_element_ids)
  group by e.id;
$$;
```
