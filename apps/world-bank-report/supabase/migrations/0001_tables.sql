-- documents → ingestion_runs → sections (a tree) + chunks; queries log.
-- Applied by worldbank_app (schema owner). Vector type lives in `extensions`.

create table worldbank.documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  filename    text not null,
  sha256      text not null unique,
  page_count  integer not null,
  created_at  timestamptz not null default now()
);

create table worldbank.ingestion_runs (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references worldbank.documents(id) on delete cascade,
  kind             text not null check (kind in ('flat:text', 'flat:markdown', 'hierarchical')),
  config_hash      text not null,
  config           jsonb not null,
  embedding_model  text not null,
  embedding_dims   integer not null,
  status           text not null default 'running' check (status in ('running', 'completed', 'failed')),
  stats            jsonb,
  is_active        boolean not null default false,
  notes            text,
  error            text,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz,
  unique (document_id, config_hash)
);

-- One active run per kind, so every preset is usable at the same time.
create unique index ingestion_runs_one_active_per_kind on worldbank.ingestion_runs (kind) where is_active;

create table worldbank.sections (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references worldbank.ingestion_runs(id) on delete cascade,
  parent_id        uuid references worldbank.sections(id) on delete cascade,
  level            integer not null,             -- 0 = report, 1 = chapter, …
  ordinal          integer not null,             -- document order across the run
  title            text not null,
  path             text[] not null,              -- ['Regional Outlooks','South Asia','Outlook']
  kind             text not null,                -- report | front_matter | chapter | section | box | appendix | references
  page_start       integer not null,
  page_end         integer not null,
  token_count      integer not null,             -- own + descendants
  own_text         text,                         -- direct blocks, for parent expansion
  own_token_count  integer not null default 0,
  regions          text[] not null default '{}', -- inherited region codes
  retrievable      boolean not null default true,
  summary          text                          -- B6
);

create table worldbank.chunks (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid not null references worldbank.ingestion_runs(id) on delete cascade,
  section_id          uuid references worldbank.sections(id) on delete cascade,
  chunk_index         integer not null,
  ordinal_in_section  integer,
  content_type        text not null check (content_type in ('flat', 'text', 'table', 'figure', 'box', 'summary')),
  title               text,
  content             text not null,
  embed_text          text not null,
  section_path        text[],
  chapter             text,
  page_start          integer not null,
  page_end            integer not null,
  page_label_start    text,
  page_label_end      text,
  regions             text[] not null default '{}',
  countries           text[] not null default '{}',
  years               integer[] not null default '{}',
  is_forecast         boolean not null default false,
  parse_source        text not null default 'gemini',
  token_count         integer not null,
  content_tsv         tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || content)) stored,
  embedding           extensions.vector(768),
  unique (run_id, chunk_index)
);

create table worldbank.queries (
  id                uuid primary key default gen_random_uuid(),
  question          text not null,
  preset            text not null,
  run_ids           uuid[] not null,
  analysis          jsonb,
  trace             jsonb not null,
  context_sources   jsonb not null,
  answer            text,
  citations         integer[],
  invalid_citations integer[],
  tokens            jsonb,
  latency_ms        integer,
  first_token_ms    integer,
  error             text,
  source            text not null default 'app' check (source in ('app', 'cli', 'eval')),
  created_at        timestamptz not null default now()
);
