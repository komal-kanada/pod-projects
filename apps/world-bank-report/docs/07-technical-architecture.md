# Technical Architecture

## 1. Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 App Router + TypeScript |
| UI | Tailwind 4, shadcn/ui, lucide-react |
| LLM | `gemini-3.6-flash` (parse, summaries, analysis, rerank, answer, judge) via `@google/genai` |
| Embeddings | `gemini-embedding-001`, 768-d, `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY` |
| DB | Supabase Postgres + pgvector + full-text search |
| PDF | `unpdf` (text layer, outline, labels), `pdf-lib` (split into page batches) |
| Markdown | `remark` / `mdast` + `remark-gfm` (tables) |
| Validation | `zod` (API, LLM JSON, eval file) |
| Scripts / tests | `tsx`, `vitest` |

Model ids live only in `lib/ai/gemini.ts`. If parsing quality on tables is poor
with Flash, try the Pro tier **for parsing only** (one-time cost) — decided in
Phase 1 from the fidelity report.

## 2. Runtime

```text
Browser ─POST /api/ask {question, preset}─▶ lib/rag/answer
     ├─ retrieval/pipeline(preset)
     │    ├─ analyze-query ─▶ Gemini      ┐ parallel
     │    ├─ embedQuery     ─▶ Gemini      ┘
     │    ├─ summary-route  ─▶ RPC match_summaries
     │    ├─ search         ─▶ RPC hybrid_search (× sub-queries)
     │    ├─ rerank         ─▶ Gemini
     │    └─ context        ─▶ RPC get_section_windows
     ├─ generate (stream)   ─▶ Gemini
     └─ log query + trace
◀─ NDJSON: analysis → sources → trace → token… → done
```

## 3. API

| Route | Method | Input | Output |
| --- | --- | --- | --- |
| `/api/ask` | POST | `{ question, preset?: "B0".."B6" }` | NDJSON events: `analysis`, `sources`, `trace`, `token`, `done`, `error` |
| `/api/retrieve` | POST | same | `{ trace, context, sources }` (no generation) |
| `/api/sections` | GET | `?runId` | Tree with page ranges, token counts, chunk counts, summaries |
| `/api/chunks` | GET | `?sectionId` \| `?page` \| `?type` \| `?q` | Chunks with metadata |
| `/api/runs` | GET | — | Runs, active runs per kind (flat / hierarchical), presets |

No auth; per-IP rate limit on `/api/ask`.

## 4. CLIs

| Command | Purpose |
| --- | --- |
| `npm run check:setup` | Env, Gemini, DB, migrations |
| `npm run parse [-- --pages 40-45 --force]` | Text layer, outline, Gemini markdown, fidelity report (cached/resumable) |
| `npm run tree` | Blocks + tree → `data/cache/tree.json`, prints outline |
| `npm run ingest -- --kind flat\|hierarchical [--source text\|markdown] [--summaries] [--activate]` | Creates an ingestion run |
| `npm run ask -- "q" --preset B5 --trace` | Terminal answer + stage trace |
| `npm run eval -- --presets B0,B3,B5 [--no-judge] [--only q01,q07] [--category numeric]` | Ablation run + comparison report |
| `npm test` | Unit tests (blocks, tree, chunking, metadata, context assembly, metrics) |

## 5. Presets in config

```ts
export const PRESETS = {
  B0: { run: "flat:text",        search: "vector", analyze: false, rerank: false, context: "raw",        summaries: false, k: 6 },
  B1: { run: "flat:markdown",    search: "vector", analyze: false, rerank: false, context: "raw",        summaries: false, k: 6 },
  B2: { run: "hierarchical",     search: "vector", analyze: false, rerank: false, context: "smallToBig", summaries: false, k: 8 },
  B3: { run: "hierarchical",     search: "hybrid", analyze: false, rerank: false, context: "smallToBig", summaries: false, k: 8 },
  B4: { run: "hierarchical",     search: "hybrid", analyze: true,  rerank: false, context: "smallToBig", summaries: false, k: 8 },
  B5: { run: "hierarchical",     search: "hybrid", analyze: true,  rerank: true,  context: "smallToBig", summaries: false, k: 8 },
  B6: { run: "hierarchical",     search: "hybrid", analyze: true,  rerank: true,  context: "smallToBig", summaries: true,  k: 8 },
} as const;
export const DEFAULT_PRESET = "B5"; // updated to the eval winner in Phase 9
```

Active run is tracked **per run kind** (`flat:text`, `flat:markdown`,
`hierarchical`), so all presets are usable at once.

## 6. Environment

```bash
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

All server-only.

## 7. Key decisions

| # | Decision | Alternatives | Why |
| --- | --- | --- | --- |
| D1 | Same stack as gpo-report | Python + LlamaIndex/Docling | Reuse code and knowledge; every stage transparent |
| D2 | Gemini multimodal page parsing + text-layer verification | Text layer only; Docling/LlamaParse; Unstructured | Tables/boxes/figures need layout; verification guards numbers; no extra service |
| D3 | Outline as skeleton, markdown headings for depth | Headings only | Bookmarks are authoritative where present |
| D4 | Child/parent (small-to-big) | Bigger flat chunks | Precise retrieval *and* coherent context |
| D5 | Tables as atomic chunks, embedded via summary line | Tables split as text | Tables carry most numeric answers in economic reports |
| D6 | Deterministic metadata; LLM only proposes filters | LLM-tagged metadata | Reproducible, cheap, testable; LLM filters validated against vocab |
| D7 | Soft filters with relaxation | Hard filters | A wrong inferred filter must not hide the answer |
| D8 | Listwise Gemini rerank | Cross-encoder API | No extra provider; one call for 30 items |
| D9 | Summaries route, never cite | Cite summaries | Summaries are generated text — evidence must be the report's own words |
| D10 | Document-order context with section headers | Score order | Coherent reading; mitigates lost-in-the-middle |
| D11 | Presets + ablation as a first-class feature | One pipeline | The objective is *improving* accuracy — that needs attribution |
| D12 | Parse/summaries cached on disk by hash + prompt version | Recompute | 200 pages; cost and determinism |
