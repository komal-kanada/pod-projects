# PRD — World Bank Economic Report: Advanced Document RAG

## 1. Problem statement

A ~200-page World Bank economic report is not a flat bag of text. It has
chapters, nested sections, boxes, tables, charts, footnotes, regional and
country breakdowns, historical data and forecasts. A naive RAG pipeline
(fixed-size chunks + top-k vector search) fails on it in predictable ways:

| Naive failure | Example |
| --- | --- |
| Chunk loses its context | A paragraph saying "growth is projected to slow to 3.1%" with no region or year in it |
| Tables shredded | Forecast table split mid-row; numbers detached from column headers |
| Similar sections confused | "Outlook" for East Asia vs "Outlook" for Latin America look alike to embeddings |
| Broad questions fail | "What are the main risks to the global outlook?" needs a chapter-level view, not 6 fragments |
| Comparisons fail | "Compare growth in South Asia and Sub-Saharan Africa" needs two separate retrievals |
| Context bloat | Retrieving more chunks to compensate → noisy, expensive, worse answers |

## 2. Objective

> **Improve retrieval accuracy and handling of large documents** by
> implementing hierarchical / section-aware chunking, rich metadata, advanced
> retrieval, and context management — **validated with the provided sample
> questions** and quantified against a baseline.

## 3. Users

| User | Need |
| --- | --- |
| Reviewer / mentor | Ask the sample questions, see accurate cited answers, see the ablation numbers proving each technique |
| Developer | See why a chunk was retrieved: per-stage trace, document map, chunk inspector |
| Analyst reading the report | Accurate figures with region, year, section and page |

## 4. Scope

### Must have

1. **Structure-aware parsing** — pages → markdown with headings, tables, figure
   descriptions, boxes, footnotes; numeric fidelity check; cached.
2. **Document tree** — chapters/sections/subsections with page ranges.
3. **Hierarchical chunking** — child chunks for retrieval, parent sections for
   context; atomic table/figure/box chunks.
4. **Metadata** — section path, chapter, content type, pages, regions,
   countries, years, forecast flag.
5. **Hybrid retrieval** — vector + full-text with RRF fusion.
6. **Metadata filtering** — from query analysis, with fallback.
7. **Query analysis** — intent, filters, rewrite, sub-queries for comparisons.
8. **Reranking** — LLM reranker over candidate pool.
9. **Context management** — small-to-big expansion, merge, dedupe, document
   ordering, token budget.
10. **Section/chapter summaries** — for broad questions.
11. **Pipeline presets B0–B6** selectable per request and per eval run.
12. **Ablation evaluation** with retrieval, answer, cost and latency metrics.
13. **UI** — Ask with retrieval trace, Document Map, Inspect.

### Out of scope

- Multiple documents, uploads, auth.
- Conversation memory (each question independent).
- Fine-tuning embeddings or rerankers.
- Agentic multi-step tool use beyond the fixed sub-query decomposition.
- Knowledge graphs (GraphRAG) — noted as a possible future direction only.

## 5. Functional requirements

| ID | Requirement |
| --- | --- |
| FR-1 | `npm run parse` produces per-page markdown + a fidelity report; cached, resumable |
| FR-2 | `npm run tree` builds the section tree; result viewable in Document Map |
| FR-3 | `npm run ingest -- --preset <p>` creates an ingestion run with sections, chunks, embeddings, (optionally) summaries |
| FR-4 | Every chunk has: section_id, section path, chapter, content_type, page range, regions[], countries[], years[], is_forecast |
| FR-5 | Tables are never split mid-row; split tables repeat their header row |
| FR-6 | `/api/ask` accepts `preset`, returns sources + a per-stage trace + answer |
| FR-7 | Query analysis returns typed JSON (intent, filters, rewritten query, sub-queries); invalid JSON → fall back to raw query |
| FR-8 | A filter that yields fewer than `minFilteredResults` candidates is relaxed automatically, and the trace says so |
| FR-9 | Context never exceeds `contextTokenBudget`; tables are included whole or not at all |
| FR-10 | Answers cite `[n]`; UI shows section breadcrumb + page per citation |
| FR-11 | `npm run eval -- --presets B0,B3,B5` writes a comparison report |
| FR-12 | Every query is logged with its preset, trace, tokens, latency |

## 6. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Latency | Full advanced preset p95 < 12 s; baseline p95 < 8 s |
| Cost | Parsing + summaries done once and cached; per-question token use reported |
| Reproducibility | Each eval records preset, ingestion run, prompt versions, models, commit |
| Transparency | Every stage visible in the trace; nothing "magic" |
| Security | Keys server-side only; RLS on with no public policies |

## 7. Success criteria

Measured on the gold set; "B0" = GPO-style baseline on the same document.

| Metric | Target |
| --- | --- |
| Hit@5 (final preset) | ≥ 0.90 and ≥ +15 pts over B0 |
| Section accuracy@5 | ≥ 0.85 |
| MRR | ≥ 0.75 |
| Answer correctness | ≥ 0.80 and > B0 |
| Faithfulness | ≥ 0.92 |
| Table/numeric category correctness | ≥ 0.75 |
| Out-of-scope refusal | 1.00 |
| Context tokens per answer | ≤ B0 × 1.5 at equal or better correctness |

Numbers are initial targets; the real deliverable is the honest ablation table.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Gemini page transcription changes numbers | Numeric fidelity check vs PDF text layer; flagged pages re-parsed or fall back to text layer |
| Parsing 200 pages is slow/expensive | Run once, cache per page, resumable, concurrency limit |
| Query analysis invents filters (wrong region/year) | Filters validated against known vocab; soft filtering with fallback; ablation B4 measures net effect |
| LLM reranker adds latency | Rerank only top 30 in one listwise call; preset without rerank kept |
| Summaries hallucinate | Summaries never cited directly — they route to sections whose real text is cited |
| Small gold set → noisy comparisons | Extend with added questions per category; report per-category and counts |

## 9. Deliverables

1. Working app: Ask, Document Map, Inspect.
2. CLIs: parse, tree, ingest, ask, eval.
3. `eval/results/` with all ablation runs.
4. `docs/EVAL-RESULTS.md` — ablation table, per-category findings, failure
   analysis, recommendations.
