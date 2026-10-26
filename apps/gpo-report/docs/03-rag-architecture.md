# RAG Architecture

## Core principle

> Retrieve the passages of the report most relevant to the question, then have
> Gemini answer **only** from those passages, citing them. If they do not
> contain the answer, say so.

## Pipeline

```text
                    OFFLINE (npm run ingest)                       ONLINE (per question)
┌───────────────────────────────────────────────────────┐   ┌──────────────────────────────────┐
│ PDF                                                   │   │ Question                         │
│  ↓ parser.ts      pages[] + page labels + outline     │   │  ↓ embedQuery (RETRIEVAL_QUERY)  │
│  ↓ cleaner.ts     strip headers/footers, fix text     │   │  ↓ retrieve.ts                   │
│  ↓ structure.ts   section path per line               │   │      v0: vector top-k            │
│  ↓ chunker.ts     section-aware chunks + overlap      │   │      v1: hybrid (FTS + vector)   │
│  ↓ embeddings.ts  RETRIEVAL_DOCUMENT, 768-d, batched  │──▶│  ↓ context.ts   numbered chunks  │
│  ↓ pipeline.ts    store chunks in ingestion run       │   │  ↓ prompts.ts   grounded prompt  │
└───────────────────────────────────────────────────────┘   │  ↓ Gemini (stream)               │
                 Postgres + pgvector                         │  ↓ citations.ts [n] → pages      │
                                                             │ Answer + sources (+ query log)   │
                                                             └──────────────────────────────────┘
```

---

## 1. Parsing (`lib/ingest/parser.ts`)

- Library: **`unpdf`** (pdf.js under the hood), extracting text **page by page**
  (`mergePages: false`).
- For each page keep:
  - `pageNumber` — 1-based PDF page index (what we cite internally).
  - `pageLabel` — the printed label if the PDF defines one (`pdf.getPageLabels()`),
    e.g. `"iv"` or `"12"`. Annual reports often have roman-numeral front matter, so
    the printed number and the PDF index differ. The UI shows the label when it exists.
- Extract the **PDF outline** (`pdf.getOutline()`) with its destination pages.
  Government reports usually have bookmarks; this is the most reliable source of
  section headings.
- `npm run parse` writes `data/parsed/pages.json` so the output can be checked
  by hand **before** anything is embedded.

## 2. Cleaning (`lib/ingest/cleaner.ts`)

Order matters; each step is a small pure function, unit-testable.

1. **Unicode normalisation** — NFKC; fixes ligatures (`ﬁ` → `fi`), odd spaces, smart quotes kept.
2. **Repeated header/footer removal** — a line that appears (after digit-stripping)
   in the first or last 3 lines of **≥ 30 %** of pages is a running header/footer → removed.
3. **Standalone page numbers** — lines that are only a number or roman numeral → removed.
4. **De-hyphenation** — `govern-\nment` → `government` when the joined word is lowercase.
5. **Line joining** — single newlines inside a paragraph become spaces; blank lines stay
   as paragraph breaks.
6. **Whitespace collapse.**

### 2.5 Known hard cases (verify in Phase 1)

| Case | Symptom | Baseline handling | Upgrade path (Phase 6) |
| --- | --- | --- | --- |
| Tables | Cells flattened into a stream of numbers | Keep as text; chunk does not split mid-table if possible | Detect table-heavy pages (digit density) and re-extract them with Gemini multimodal as markdown tables |
| Multi-column pages | Columns interleaved | Check by eye; pdf.js usually orders columns correctly | Per-page Gemini fallback, same as tables |
| Charts / infographics | Text missing or just labels | Accept loss | Gemini page description as an extra chunk |
| Letter / message pages | Fine | — | — |

## 3. Structure (`lib/ingest/structure.ts`)

Gives every paragraph a **section path**, e.g.
`Financial Highlights › Revenue and Expenses`.

1. If the PDF has an outline: map each outline entry to its start page; a paragraph
   belongs to the latest outline entry at or before its page (and, on the start page,
   after the heading text if found).
2. Else heuristic headings: short line (< 80 chars), no terminal period, Title Case or
   ALL CAPS, followed by a longer paragraph.

Section paths are used for: chunk boundaries, the contextual header, and display.

## 4. Chunking (`lib/ingest/chunker.ts`)

**Strategy: section-aware recursive splitting with overlap.**

1. Group paragraphs by section.
2. Within a section, pack paragraphs into chunks up to `CHUNK_TARGET_CHARS`.
3. A paragraph larger than the limit is split recursively:
   `\n\n` → `\n` → sentence (`. ? !`) → `; ,` → space.
4. Chunks **never cross a top-level section boundary**; they **may cross pages**
   (a paragraph continuing over a page break stays together). Each chunk records
   `pageStart` and `pageEnd`.
5. Overlap: the last `CHUNK_OVERLAP_CHARS` of the previous chunk (trimmed to a sentence
   start) is prepended to the next chunk in the same section.
6. Chunks shorter than `CHUNK_MIN_CHARS` merge into their neighbour.

### Baseline config (`lib/config.ts`)

| Setting | Value | Why |
| --- | --- | --- |
| `CHUNK_TARGET_CHARS` | 3200 (~800 tokens) | Big enough to hold a full paragraph + figures, small enough to retrieve precisely |
| `CHUNK_OVERLAP_CHARS` | 400 (~12 %) | Prevents answers being cut at a seam |
| `CHUNK_MIN_CHARS` | 200 | Removes header-only fragments |

Characters, not tokens: no tokeniser dependency; ~4 chars/token is accurate enough.

### Contextual header

What gets **embedded** is not the raw chunk but:

```text
GPO Annual Report | Section: Financial Highlights › Revenue | Pages 14–15
<chunk content>
```

Stored as `embed_text`; `content` keeps the clean text for display and prompting.
This cheaply puts the section name into the vector, which helps questions like
"What does the report say about workforce?" find chunks whose body never repeats
the word.

## 5. Embeddings (`lib/ai/embeddings.ts`)

| Setting | Value |
| --- | --- |
| Model | `gemini-embedding-001` |
| Dimensions | 768 (`outputDimensionality`) |
| Document task type | `RETRIEVAL_DOCUMENT` (with `title` = section path) |
| Query task type | `RETRIEVAL_QUERY` |
| Normalisation | L2-normalise every vector (required below full 3072-d output) |
| Batching | 50 texts per request, sequential batches |
| Retries | Exponential backoff on 429 / 5xx, max 5 attempts |

Model id and dimensions are stored on the ingestion run. **Queries must be
embedded with the same model and dimensions as the run being searched** —
`retrieve.ts` checks this and fails loudly on mismatch.

## 6. Storage

Supabase Postgres + pgvector. See `05-database-schema.md`.

- `ingestion_runs` — one row per (document, config). Exactly one `is_active`.
- `chunks` — content, embed_text, section path, page range, `vector(768)`,
  generated `tsvector` for keyword search.
- Idempotency: `ingestion_runs` is unique on `(document_id, config_hash)`;
  re-running the same config is a no-op unless `--force`.

## 7. Retrieval (`lib/retrieval/`)

### v0 — vector (baseline)

```sql
order by embedding <=> query_embedding   -- cosine distance
limit top_k                               -- default 6
```

- Restricted to the active ingestion run.
- Returns `similarity = 1 - distance`.
- `MIN_SIMILARITY` (default **off**) — calibrate from eval data, then decide whether
  to short-circuit to a refusal when the best score is very low.

### v1 — hybrid (Phase 6, kept only if eval improves)

- Keyword: `websearch_to_tsquery('english', q)` against `content_tsv`, ranked by `ts_rank_cd`.
- Vector: as v0.
- Take top 20 from each, fuse with **Reciprocal Rank Fusion**:
  `score = Σ 1 / (60 + rank_i)`, return top_k.
- Why it should help here: annual reports are full of exact tokens — fiscal years,
  dollar figures, program names, acronyms — that dense embeddings blur.

### Not in the baseline (documented as possible next steps)

- Cross-encoder / LLM reranking.
- Query rewriting / HyDE / multi-query.
- Parent-child or sentence-window retrieval.

## 8. Context building (`lib/rag/context.ts`)

Retrieved chunks are numbered in rank order and wrapped:

```text
<context>
<chunk id="1" pages="14-15" section="Financial Highlights › Revenue">
...content...
</chunk>
<chunk id="2" pages="3" section="Message from the Director">
...
</chunk>
</context>
```

Chunks are kept in **rank order** (most relevant first). Total context at k=6 is
~5k tokens — no truncation needed.

## 9. Generation (`lib/rag/answer.ts`)

- Model: `gemini-3.6-flash` (same as interview-prep, chosen there on measured latency).
- `temperature: 0.2`, streamed.
- Prompt in `06-prompts.md`. Key rules: answer only from context, cite `[n]`,
  quote figures exactly with units and year, never combine figures from different
  years, fixed refusal sentence when the answer is not present.

### Response stream (NDJSON)

```json
{"type":"sources","chunks":[{"n":1,"chunkId":"…","pageStart":14,"pageEnd":15,"pageLabel":"12","section":"…","similarity":0.78,"content":"…"}]}
{"type":"token","text":"The report states"}
{"type":"done","latencyMs":2140,"citations":[1,3],"queryId":"…"}
```

Sources are sent **first**, so the UI can show them while the answer streams.

## 10. Citations (`lib/rag/citations.ts`)

- Parse `[n]` and `[n, m]` from the final answer.
- Drop any `n` outside `1..k` (hallucinated citation) and record it in the query log.
- Map `n` → chunk → page label/range for badges.

## 11. Query logging

Every `/api/ask` call writes a `queries` row: question, run id, retrieval mode,
retrieved chunk ids + scores, answer, citations, invalid citations, latency, models.
This is the raw material for spotting failures outside the gold set.

## 12. Failure modes and how we'd see them

| Symptom | Where to look | Likely cause |
| --- | --- | --- |
| Right page never retrieved | `/inspect`, chunk browser for that page | Bad parse / header noise / chunk too big |
| Right page retrieved at rank 5+ | `/inspect` scores | Vocabulary mismatch → hybrid search |
| Correct chunks, wrong answer | Query log, answer vs context | Prompt rule, year mixing, table text |
| Answer with no citations | Query log `citations = []` | Prompt adherence; tighten instruction |
| Refuses when answer exists | Eval `in_scope_refusals` | Answer split across chunks → overlap / k |
