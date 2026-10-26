-- documents → ingestion_runs → pages → elements → derived chunks;
-- elements ↔ elements via footnote_links; queries log.

create table imac.documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  filename    text not null,
  sha256      text not null unique,
  page_count  integer not null,
  created_at  timestamptz not null default now()
);

create table imac.ingestion_runs (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references imac.documents(id) on delete cascade,
  strategy         text not null check (strategy in ('X0', 'X1', 'X2', 'X3')),
  representation   text not null check (representation in ('flat', 'typed')),
  config_hash      text not null,
  config           jsonb not null,
  embedding_model  text not null,
  embedding_dims   integer not null,
  status           text not null default 'running' check (status in ('running', 'completed', 'failed')),
  stats            jsonb,
  is_active        boolean not null default false,
  error            text,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz,
  unique (document_id, config_hash)
);
-- One active run per (strategy, representation) so all presets work side by side.
create unique index ingestion_runs_active on imac.ingestion_runs (strategy, representation) where is_active;

create table imac.pages (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references imac.ingestion_runs(id) on delete cascade,
  page_number  integer not null,
  image_path   text not null,
  width        integer not null,
  height       integer not null,
  unique (run_id, page_number)
);

create table imac.elements (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references imac.ingestion_runs(id) on delete cascade,
  page_id        uuid not null references imac.pages(id) on delete cascade,
  element_key    text not null,                -- stable: <strategy>-p03-e07
  page_number    integer not null,
  reading_order  integer not null,
  type           text not null check (type in ('heading', 'text', 'table', 'chart', 'footnote', 'callout', 'image')),
  bbox           integer[],                    -- [ymin, xmin, ymax, xmax] 0–1000
  crop_path      text,
  title          text,
  section        text,
  text           text,
  data           jsonb,                        -- table {columns, rows, …} | chart {chartType, series, …}
  markdown       text,                         -- LLM-facing rendering
  marker         text,                         -- footnotes only
  fidelity       jsonb,
  overridden     boolean not null default false,
  unique (run_id, element_key)
);

create table imac.footnote_links (
  element_id   uuid not null references imac.elements(id) on delete cascade,
  footnote_id  uuid not null references imac.elements(id) on delete cascade,
  marker       text not null,
  primary key (element_id, footnote_id)
);

create table imac.chunks (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references imac.ingestion_runs(id) on delete cascade,
  element_id        uuid references imac.elements(id) on delete cascade,
  chunk_kind        text not null check (chunk_kind in
                      ('flat', 'text', 'table_summary', 'table_row', 'chart_summary', 'chart_fact', 'footnote', 'callout', 'image')),
  element_type      text,
  content           text not null,
  embed_text        text not null,
  fts_text          text not null,               -- units/terms normalised, for keyword search
  page_number       integer not null,
  section           text,
  variants          text[] not null default '{}',
  phases            text[] not null default '{}',
  units             text[] not null default '{}',
  has_numbers       boolean not null default false,
  ordinal           integer not null,
  fts_tsv           tsvector generated always as (to_tsvector('english', fts_text)) stored,
  embedding         extensions.vector(768),
  visual_embedding  extensions.vector(1024)      -- M5 only
);

create table imac.queries (
  id                 uuid primary key default gen_random_uuid(),
  question           text not null,
  preset             text not null,
  run_id             uuid references imac.ingestion_runs(id) on delete set null,
  analysis           jsonb,
  trace              jsonb not null,
  sources            jsonb not null,
  answer             text,
  citations          integer[],
  invalid_citations  integer[],
  disagreements      text,
  tokens             jsonb,
  latency_ms         integer,
  first_token_ms     integer,
  error              text,
  source             text not null default 'app' check (source in ('app', 'cli', 'eval')),
  created_at         timestamptz not null default now()
);
