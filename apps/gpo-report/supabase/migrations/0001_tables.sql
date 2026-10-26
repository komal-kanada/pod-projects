-- Documents → ingestion runs → chunks; every question asked → queries.
-- Applied by gpo_app (schema owner). Vector type lives in `extensions`.

create table gpo.documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  filename    text not null,
  sha256      text not null unique,            -- the same file is never stored twice
  page_count  integer not null,
  created_at  timestamptz not null default now()
);

-- One row per (document, chunking + embedding config). Versioned, so
-- configurations can be compared in eval without losing the baseline.
create table gpo.ingestion_runs (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references gpo.documents(id) on delete cascade,
  config_hash      text not null,
  config           jsonb not null,
  embedding_model  text not null,
  embedding_dims   integer not null,
  status           text not null default 'running'
                     check (status in ('running', 'completed', 'failed')),
  chunk_count      integer,
  stats            jsonb,
  is_active        boolean not null default false,
  notes            text,
  error            text,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz,
  unique (document_id, config_hash)
);

-- At most one active run: the one the app answers from.
create unique index ingestion_runs_one_active on gpo.ingestion_runs (is_active) where is_active;

create table gpo.chunks (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references gpo.ingestion_runs(id) on delete cascade,
  document_id       uuid not null references gpo.documents(id) on delete cascade,
  chunk_index       integer not null,          -- reading order within the run
  content           text not null,             -- clean text: shown, and sent to the LLM
  embed_text        text not null,             -- contextual header + content: what was embedded
  section_path      text,                      -- "Financial Highlights › Revenue"
  page_start        integer not null,          -- PDF page index, 1-based
  page_end          integer not null,
  page_label_start  text,                      -- printed page label
  page_label_end    text,
  char_count        integer not null,
  content_tsv       tsvector generated always as (to_tsvector('english', content)) stored,
  embedding         extensions.vector(768),
  created_at        timestamptz not null default now(),
  unique (run_id, chunk_index)
);

create table gpo.queries (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid references gpo.ingestion_runs(id) on delete set null,
  question           text not null,
  retrieval_mode     text not null,
  top_k              integer not null,
  retrieved          jsonb not null,          -- [{chunkId, rank, similarity, pageStart, pageEnd}]
  answer             text,
  citations          integer[],
  invalid_citations  integer[],
  generation_model   text,
  latency_ms         integer,
  first_token_ms     integer,
  error              text,
  source             text not null default 'app' check (source in ('app', 'cli', 'eval')),
  created_at         timestamptz not null default now()
);
