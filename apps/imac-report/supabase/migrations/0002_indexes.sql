create index elements_run_page_idx on imac.elements (run_id, page_number, reading_order);
create index elements_type_idx     on imac.elements (run_id, type);
create index chunks_run_kind_idx   on imac.chunks (run_id, chunk_kind);
create index chunks_element_idx    on imac.chunks (element_id);
create index chunks_fts_idx        on imac.chunks using gin (fts_tsv);
create index chunks_variants_idx   on imac.chunks using gin (variants);
create index queries_created_idx   on imac.queries (created_at desc);
