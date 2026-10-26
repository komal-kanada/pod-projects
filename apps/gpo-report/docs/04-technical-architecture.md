# Technical Architecture

## 1. Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) + TypeScript | Same as interview-prep |
| UI | Tailwind CSS 4 + shadcn/ui + lucide-react | |
| LLM | Gemini `gemini-3.6-flash` via `@google/genai` | Model ids in `lib/ai/gemini.ts` only |
| Embeddings | Gemini `gemini-embedding-001`, 768-d | |
| Vector DB | Supabase Postgres + pgvector (HNSW, cosine) | |
| PDF | `unpdf` | |
| Scripts | `tsx` | Run TypeScript CLIs that share `lib/` |
| Validation | `zod` | Eval file, API bodies, judge JSON |
| Tests | `vitest` | Cleaner, chunker, citations, metrics (pure functions) |

## 2. Runtime view

```text
Browser ──POST /api/ask──▶ route.ts ──▶ lib/rag/answer.ts
                                          ├─ lib/ai/embeddings.embedQuery ──▶ Gemini
                                          ├─ lib/retrieval/retrieve ──RPC──▶ Supabase (match_chunks)
                                          ├─ lib/rag/context + lib/ai/prompts
                                          ├─ Gemini generateContentStream ──▶ tokens
                                          └─ insert queries row
        ◀──NDJSON: sources → tokens → done──

Terminal ── npm run ingest ──▶ lib/ingest/pipeline ──▶ Gemini (embed) + Supabase (insert)
Terminal ── npm run eval   ──▶ lib/eval/* ──▶ lib/rag/answer (non-streaming) + judge ──▶ eval/results/
```

## 3. API routes

All routes are Node runtime, server-only, no auth (single public document).
Inputs validated with zod; errors return `{ error: string }` with a sensible status.

| Route | Method | Body / Query | Response |
| --- | --- | --- | --- |
| `/api/ask` | POST | `{ question: string (3–500), topK?: 1–12, mode?: "vector" \| "hybrid" }` | NDJSON stream (see 03 §9) |
| `/api/retrieve` | POST | same as ask | `{ runId, mode, embeddingMs, searchMs, chunks: RetrievedChunk[] }` |
| `/api/chunks` | GET | `?page=14` or `?q=text&limit=50` | `{ chunks: Chunk[] }` for the active run |
| `/api/runs` | GET | — | `{ runs: IngestionRun[], activeRunId }` |

Basic abuse guard: in-memory rate limit on `/api/ask` (e.g. 20 req/min/IP) since
there is no auth.

## 4. CLI scripts

| Command | Does | Needs |
| --- | --- | --- |
| `npm run check:setup` | Verifies env vars, Gemini key, DB + pgvector, migrations | env |
| `npm run parse -- [pdf]` | Parse + clean + structure → `data/parsed/pages.json`, `chunks.preview.json`, prints stats | nothing |
| `npm run ingest -- [pdf] [--chunk 3200] [--overlap 400] [--activate] [--force]` | Full pipeline into a new ingestion run | Gemini, DB |
| `npm run activate -- <runId>` | Switch the active run | DB |
| `npm run ask -- "question" [--k 6] [--mode hybrid]` | Answer in the terminal with sources | Gemini, DB |
| `npm run eval -- [--run <id>] [--mode vector] [--k 6] [--no-judge]` | Runs gold set, writes results | Gemini, DB |
| `npm test` | Unit tests | nothing |

## 5. Configuration (`lib/config.ts`)

```ts
export const RAG_CONFIG = {
  chunk: { targetChars: 3200, overlapChars: 400, minChars: 200 },
  embedding: { model: "gemini-embedding-001", dims: 768, batchSize: 50 },
  retrieval: { mode: "vector", topK: 6, candidatePool: 20, rrfK: 60, minSimilarity: null },
  generation: { model: "gemini-3.6-flash", temperature: 0.2, maxOutputTokens: 1024 },
  judge: { model: "gemini-3.6-flash", temperature: 0 },
} as const;
```

`config_hash` = sha256 of the `chunk` + `embedding` sections → identifies an ingestion run.

## 6. Environment

```bash
# .env.example
GEMINI_API_KEY=                 # server only
SUPABASE_URL=                   # server only — no browser client needed in this project
SUPABASE_SERVICE_ROLE_KEY=      # server only, never NEXT_PUBLIC_
```

No `NEXT_PUBLIC_*` vars: the browser only talks to our API routes.

## 7. Key decisions

| # | Decision | Alternatives | Why |
| --- | --- | --- | --- |
| D1 | Reuse interview-prep stack (Next.js + Gemini + Supabase) | Python + LangChain/LlamaIndex + Chroma | Known stack, reusable code, one language; the goal is understanding RAG, not a framework |
| D2 | No RAG framework | LangChain.js | Every stage visible and debuggable; baseline should be transparent |
| D3 | Ingestion is a CLI, not an upload UI | Upload page | One fixed document; removes auth/storage complexity |
| D4 | Ingestion runs are versioned | Overwrite chunks on re-ingest | Compare chunking configs in eval without losing the baseline |
| D5 | Section-aware chunks that may cross pages | Per-page chunking (interview-prep) | Report paragraphs and tables flow over page breaks |
| D6 | Contextual header in `embed_text` | Embed raw content | Cheap, well-known retrieval gain; reversible per run |
| D7 | Citations as `[n]` chunk refs, mapped to pages in code | Model writes page numbers | Model can't hallucinate page numbers; invalid refs are detectable |
| D8 | Vector-only baseline, hybrid as measured upgrade | Hybrid from day one | "Baseline" means a clean reference number first |
| D9 | No auth, RLS on with no public policies; service role on server | Supabase auth | Single public document; tables still unreachable from the browser |
| D10 | LLM-as-judge + manual review | Manual only / judge only | Judge scales; manual review catches judge leniency |

## 8. Error handling

Reuse interview-prep's `GeminiError` mapping (rate limit, overloaded, safety block,
empty response) and surface friendly messages in the UI. In the ingestion CLI,
failures are fatal and leave the run as `status = 'failed'` — never a half-active run.
