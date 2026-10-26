create index chunks_run_idx  on gpo.chunks (run_id, chunk_index);
create index chunks_page_idx on gpo.chunks (run_id, page_start, page_end);
create index chunks_tsv_idx  on gpo.chunks using gin (content_tsv);
create index queries_created_idx on gpo.queries (created_at desc);

-- A few hundred chunks don't need an ANN index: exact search is fast and
-- exact. Add this only if a run grows past a few thousand chunks:
-- create index chunks_embedding_idx on gpo.chunks using hnsw (embedding extensions.vector_cosine_ops);
