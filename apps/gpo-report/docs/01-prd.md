# PRD — GPO Annual Report: Baseline RAG

## 1. Problem statement

The GPO Annual Report is long, dense, and mixes narrative, figures, and tables.
Finding a specific fact ("What was X in fiscal year Y?") means scrolling through
dozens of pages. A question-answering system over the report should return a
correct, sourced answer in seconds — and say so honestly when the report does
not contain the answer.

## 2. Objective

> Build a **solid baseline RAG pipeline** over the GPO Annual Report, covering
> document ingestion, chunking, embeddings, retrieval, and response generation,
> and **validate** it using the provided sample questions.

"Baseline" means: simple, correct, well-understood, and **measured**. Every
later improvement (hybrid search, reranking, better table handling) must be
justified by a number from the evaluation harness, compared against this
baseline.

## 3. Users

| User | Need |
| --- | --- |
| Reviewer / mentor | Ask the sample questions, see correct, cited answers, see the eval scores |
| Developer (us) | Inspect chunks and retrieval results to debug and tune the pipeline |
| Reader of the report | Get fast answers with a page reference they can check |

## 4. Scope

### In scope (must have)

1. **Ingestion** — parse the PDF page by page, clean it, keep page numbers and
   section headings.
2. **Chunking** — section-aware recursive chunking with overlap; every chunk
   carries page range and section path.
3. **Embeddings** — Gemini embeddings stored in Postgres/pgvector.
4. **Retrieval** — top-k cosine similarity search, configurable k.
5. **Generation** — grounded answer from retrieved chunks only, with inline
   citations mapped to page numbers; explicit refusal when not in the report.
6. **Ask UI** — question box, sample-question chips, streaming answer, sources
   panel.
7. **Inspect UI** — see exactly which chunks were retrieved, with scores; browse
   chunks by page.
8. **Evaluation harness** — CLI that runs the gold question set and reports
   retrieval and answer metrics to a file.
9. **Ingestion runs** — each chunking configuration is stored as a versioned
   run, so configurations can be compared side by side.

### Should have (Phase 6, only if eval justifies)

- Hybrid retrieval (full-text + vector, fused with Reciprocal Rank Fusion).
- Chunk size / overlap / top-k tuning from an experiment matrix.
- Better table handling for numeric questions (see 03 §2.5).

### Out of scope

- Authentication, multi-user, multiple documents, uploads through the UI.
- Conversation memory / follow-up questions (each question is independent).
- Agents, tool use, query decomposition.
- Fine-tuning.

## 5. Functional requirements

| ID | Requirement |
| --- | --- |
| FR-1 | `npm run ingest` ingests the PDF into a new ingestion run and prints chunk stats |
| FR-2 | Re-ingesting the same file with the same config is idempotent (no duplicate chunks) |
| FR-3 | Exactly one ingestion run is **active**; the app queries only the active run |
| FR-4 | A question returns an answer in which each factual claim cites at least one chunk `[n]` |
| FR-5 | Citations render as page badges (e.g. `p. 14`) linked to the source chunk |
| FR-6 | If the context does not contain the answer, the reply is the fixed refusal sentence |
| FR-7 | The sources panel shows every retrieved chunk with page range, section, and score |
| FR-8 | `/inspect` shows retrieval for any query without calling the generator |
| FR-9 | `npm run eval` writes `eval/results/<timestamp>-<run>.md` and `.json` |
| FR-10 | Every question asked in the app is logged with retrieved chunk ids, answer, latency |

## 6. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Latency | First token < 3 s p50; full answer < 8 s p95 |
| Cost | Single document; embeddings computed once per ingestion run |
| Security | API keys server-side only; Supabase service role never reaches the browser |
| Reproducibility | Every eval result records ingestion run id, config, models, git commit |
| Understandability | Each pipeline stage is a separate, readable module with a header comment |

## 7. Success criteria (initial targets — revisit after first eval)

| Metric | Target |
| --- | --- |
| Retrieval Hit@6 (expected page retrieved) | ≥ 0.85 |
| Retrieval MRR | ≥ 0.65 |
| Answer correctness (judge, avg of 0–2 scaled to 0–1) | ≥ 0.75 |
| Faithfulness (no unsupported claims) | ≥ 0.90 |
| Out-of-scope refusal accuracy | 1.00 |
| Citation accuracy (cites an expected page) | ≥ 0.80 |

All sample questions pass a manual review before the project is called done.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Tables flatten into unreadable text → numeric questions fail | Track the `numeric` category separately; Phase 6 table handling |
| Repeated headers/footers pollute chunks and similarity | Header/footer removal in the cleaner, verified by hand in Phase 1 |
| Multi-column layout interleaves text | Inspect parsed pages in Phase 1; fall back to Gemini page parsing for broken pages |
| Questions about a specific fiscal year retrieve the wrong year | Prompt rule: never merge years; eval questions include year-specific cases |
| LLM judge too lenient (same model judges itself) | Manual review of all failures + 10 random passes per eval |
| Sample questions too few to be meaningful | Extend the gold set with paraphrased and out-of-scope questions (07 §2) |

## 9. Deliverables

1. Working app (Ask + Inspect).
2. Ingest and eval CLIs.
3. `eval/results/` with the baseline run and any improvement runs.
4. `docs/EVAL-RESULTS.md` — a short write-up: baseline numbers, what changed, what improved, known failures.
