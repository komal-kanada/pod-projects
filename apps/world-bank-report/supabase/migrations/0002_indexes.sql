create index sections_run_idx     on worldbank.sections (run_id, ordinal);
create index sections_parent_idx  on worldbank.sections (parent_id);
create index chunks_run_type_idx  on worldbank.chunks (run_id, content_type);
create index chunks_section_idx   on worldbank.chunks (section_id, ordinal_in_section);
create index chunks_page_idx      on worldbank.chunks (run_id, page_start, page_end);
create index chunks_tsv_idx       on worldbank.chunks using gin (content_tsv);
create index chunks_regions_idx   on worldbank.chunks using gin (regions);
create index chunks_countries_idx on worldbank.chunks using gin (countries);
create index chunks_years_idx     on worldbank.chunks using gin (years);
create index queries_created_idx  on worldbank.queries (created_at desc);
-- ~2.5k vectors: exact scan is fine. If it grows:
-- create index chunks_embedding_idx on worldbank.chunks using hnsw (embedding extensions.vector_cosine_ops);
