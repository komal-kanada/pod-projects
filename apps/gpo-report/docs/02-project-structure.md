# Project Structure

Single Next.js app. Pipeline stages live in `lib/` as plain TypeScript modules
so the same code runs from the API routes **and** the CLI scripts.

```text
gpo-report/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                     # Ask screen
│   ├── globals.css
│   ├── inspect/
│   │   └── page.tsx                 # Retrieval inspector + chunk browser
│   └── api/
│       ├── ask/route.ts             # POST question → NDJSON stream (sources, tokens, done)
│       ├── retrieve/route.ts        # POST question → ranked chunks (no generation)
│       ├── chunks/route.ts          # GET chunks for active run, filter by page
│       └── runs/route.ts            # GET ingestion runs + which one is active
│
├── components/
│   ├── ask/
│   │   ├── question-form.tsx
│   │   ├── sample-questions.tsx     # Chips from eval/questions.json (in-scope ones)
│   │   ├── answer.tsx               # Renders markdown, turns [n] into page badges
│   │   └── sources-panel.tsx        # Retrieved chunks, page range, section, score
│   ├── inspect/
│   │   ├── retrieval-table.tsx
│   │   └── chunk-browser.tsx
│   └── ui/                          # shadcn components
│
├── lib/
│   ├── config.ts                    # ALL tunables: chunk size, overlap, top-k, models, thresholds
│   ├── env.ts                       # Reads + validates env vars (server only)
│   ├── ndjson.ts                    # Stream helpers (reuse from interview-prep)
│   ├── ai/
│   │   ├── gemini.ts                # Client, model ids, error mapping (reuse from interview-prep)
│   │   ├── embeddings.ts            # embedDocuments() / embedQuery(), batching, normalisation
│   │   └── prompts.ts               # Answer prompt + judge prompts (see 06-prompts.md)
│   ├── ingest/
│   │   ├── parser.ts                # PDF → pages[] (text, pageNumber, pageLabel)
│   │   ├── cleaner.ts               # Header/footer removal, de-hyphenation, ligatures, whitespace
│   │   ├── structure.ts             # Section headings: PDF outline first, heuristics fallback
│   │   ├── chunker.ts               # Section-aware recursive splitter with overlap
│   │   └── pipeline.ts              # parse → clean → structure → chunk → embed → store
│   ├── retrieval/
│   │   ├── vector.ts                # match_chunks RPC
│   │   ├── hybrid.ts                # Phase 6: hybrid_search RPC (FTS + vector, RRF)
│   │   └── retrieve.ts              # Entry point: picks mode, applies top-k / min score
│   ├── rag/
│   │   ├── context.ts               # Formats chunks into the numbered <context> block
│   │   ├── answer.ts                # retrieve → prompt → stream; logs the query
│   │   └── citations.ts             # Parse [n], drop invalid ids, map to pages
│   ├── eval/
│   │   ├── load.ts                  # Reads + validates eval/questions.json
│   │   ├── metrics.ts               # Hit@k, Recall@k, MRR, citation accuracy
│   │   ├── judge.ts                 # LLM-as-judge: correctness + faithfulness
│   │   └── report.ts                # Writes markdown + JSON results
│   └── supabase/
│       └── admin.ts                 # Service-role client (server only)
│
├── scripts/
│   ├── check-setup.mjs              # Env + DB connectivity check
│   ├── parse.ts                     # npm run parse  → data/parsed/pages.json (no DB, no API)
│   ├── ingest.ts                    # npm run ingest → new ingestion run in DB
│   ├── activate.ts                  # npm run activate -- <runId>
│   ├── ask.ts                       # npm run ask -- "question"  (CLI answer, for quick checks)
│   └── eval.ts                      # npm run eval   → eval/results/*
│
├── eval/
│   ├── questions.json               # Gold set: sample questions + expected pages/answers
│   └── results/                     # One .md + .json per eval run (committed)
│
├── data/
│   ├── gpo-annual-report.pdf        # Source document
│   └── parsed/                      # Debug output of npm run parse (gitignored)
│
├── supabase/
│   ├── migrations/
│   │   ├── 0001_extensions.sql
│   │   ├── 0002_tables.sql
│   │   ├── 0003_indexes.sql
│   │   ├── 0004_search_functions.sql
│   │   └── 0005_hybrid_search.sql   # Phase 6
│   └── apply-all.sql
│
├── types/index.ts                   # Page, Chunk, RetrievedChunk, IngestionRun, EvalQuestion…
├── docs/
├── .env.example
├── package.json
└── README.md
```

## Rules

1. **`lib/` never imports from `app/` or `components/`.** Scripts and routes both
   depend on `lib/`; nothing depends on the routes.
2. **One tunable, one place.** Every number that affects results lives in
   `lib/config.ts`, and the active values are written into every ingestion run
   and eval result.
3. **Server-only modules** (`env.ts`, `ai/*`, `supabase/admin.ts`) start with
   `import "server-only"` — except where a CLI script needs them, in which case
   the script imports a non-`server-only` core and the route wraps it.
4. **Every pipeline module has a header comment** explaining *why* it does what
   it does (same style as interview-prep).

## Reused from interview-prep

| From | To | Change |
| --- | --- | --- |
| `lib/ai/gemini.ts` | `lib/ai/gemini.ts` | Drop features not needed (structured quiz output etc.) |
| `lib/ai/embeddings.ts` | `lib/ai/embeddings.ts` | Add batching + query/document task types if missing |
| `lib/documents/parser.ts` | `lib/ingest/parser.ts` | Add page labels + outline extraction |
| `lib/documents/chunker.ts` | `lib/ingest/chunker.ts` | Make section-aware, allow chunks to span pages |
| `lib/ndjson.ts` | `lib/ndjson.ts` | As is |
| `scripts/check-setup.mjs` | `scripts/check-setup.mjs` | New env var list |
