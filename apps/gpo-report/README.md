# GPO Annual Report · Baseline RAG

A clean, measured RAG pipeline over one report: parse → clean → section-aware
chunks → Gemini embeddings → pgvector search → grounded, cited answers — and
an eval harness that scores it against the sample questions.

Design docs: [`docs/`](docs/README.md) (start with `PLAN.md`).

## Setup (once)

1. **Database role.** In the Supabase SQL editor, run
   [`supabase/bootstrap.sql`](supabase/bootstrap.sql) after setting a password.
   It creates schema `gpo` owned by role `gpo_app`, which can't see PrepSprint's
   tables or the other POD apps' schemas.
2. **Env.** `cp .env.example .env.local`, then fill in:
   - `DATABASE_URL`: transaction pooler, user `gpo_app.<project-ref>`, port 6543
     (Supabase → Connect → Transaction pooler, with the user swapped).
   - `GEMINI_API_KEY`: ideally from a GCP project separate from PrepSprint's.
   Add the same two variables to this app's Vercel project.
3. **Tables.** `pnpm --filter gpo-report db:migrate`
4. **Inputs.** The PDF goes in `data/gpo-annual-report.pdf`, and the sample
   questions go verbatim into `eval/questions.json` (`"source": "provided"`).
5. **Check.** `pnpm --filter gpo-report check:setup`. It also verifies the role
   can't read anything outside `gpo`.

## Commands (run inside `apps/gpo-report`, or prefix with `pnpm --filter gpo-report`)

| Command | What it does |
| --- | --- |
| `pnpm parse` | Parse + clean + sections + chunks, no API calls. Writes `data/parsed/` for checking by hand |
| `pnpm ingest --activate` | Embed and store a new ingestion run. Same file and config is a no-op (`--force` rebuilds) |
| `pnpm ingest --chunk 1600 --overlap 400` | Experiment runs (E1–E3: `--chunk`, `--overlap`, `--no-header`) |
| `pnpm activate [id]` | List runs, or switch the active one |
| `pnpm ask "question" [--k 6] [--mode hybrid]` | Answer in the terminal, with sources |
| `pnpm eval [--no-judge] [--mode hybrid] [--k 8] [--run id]` | Score the gold set → `eval/results/*.md/.json` |
| `pnpm test` | Unit tests, plus an end-to-end test on in-memory Postgres + pgvector |
| `pnpm dev` | App at http://localhost:3001 (Ask, Inspect) |

## How it works

```text
PDF ─ unpdf (text, page labels, outline)
    ─ clean (running headers/footers, page numbers, hyphenation, wraps)
    ─ sections (PDF outline, else heading heuristics)
    ─ chunks (3200 chars, 400 overlap, never across sections, may span pages)
    ─ embed "title | section | pages + text" (gemini-embedding-001, 768-d)
    ─ gpo.chunks (pgvector + tsvector), versioned by ingestion run

question ─ embed ─ top-k cosine (or hybrid RRF) ─ numbered <context>
         ─ gemini-3.6-flash, answer only from context, cite [n]
         ─ [n] mapped to page badges in code ─ logged to gpo.queries
```

Code map: `lib/ingest/*` (offline), `lib/retrieval`, `lib/rag` (online),
`lib/eval` and `scripts/eval.ts`, `lib/db/*` (all SQL), `lib/config.ts`
(every tunable). Shared building blocks come from `@pod/ai`, `@pod/rag`,
`@pod/db`, `@pod/eval` and `@pod/ui`.

## Differences from the original docs

- The database is a dedicated Postgres role and schema, reached with
  `DATABASE_URL` through postgres.js, instead of `SUPABASE_URL` plus a
  service-role key. No Supabase keys exist in this app, and isolation is
  enforced by Postgres grants rather than RLS.
- Hybrid search (`gpo.hybrid_search`) ships with migration 0003 and can be
  chosen per request. Vector stays the default until eval says otherwise.
- Not built yet: experiment E6 (re-extracting table pages with Gemini).
