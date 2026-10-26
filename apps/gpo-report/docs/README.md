# GPO Annual Report — Baseline RAG · Docs

Start here. Read in this order.

| # | File | What it answers |
| --- | --- | --- |
| — | [PLAN.md](PLAN.md) | What gets built, in what order, and how each phase is verified |
| 01 | [01-prd.md](01-prd.md) | What the product is, who it is for, scope, success criteria |
| 02 | [02-project-structure.md](02-project-structure.md) | Folder layout and what every file is responsible for |
| 03 | [03-rag-architecture.md](03-rag-architecture.md) | The pipeline: ingestion → chunking → embeddings → retrieval → generation |
| 04 | [04-technical-architecture.md](04-technical-architecture.md) | Stack, API routes, CLI scripts, config, env, key decisions |
| 05 | [05-database-schema.md](05-database-schema.md) | Tables, indexes, SQL search functions |
| 06 | [06-prompts.md](06-prompts.md) | The answer prompt, refusal rule, citation format, judge prompts |
| 07 | [07-evaluation.md](07-evaluation.md) | Gold question set, metrics, targets, experiment log |
| 08 | [08-ui.md](08-ui.md) | The two screens: Ask and Inspect |

## One-line summary

> Ingest the GPO Annual Report once, retrieve the most relevant passages for a
> question, have Gemini answer **only** from those passages with page
> citations — and prove it works with a scored evaluation over the sample
> questions.

## Inputs still needed

- [ ] The GPO Annual Report PDF → `data/gpo-annual-report.pdf`
- [ ] The sample questions → `eval/questions.json` (format in 07-evaluation.md)
- [ ] `GEMINI_API_KEY`
- [ ] A Supabase project (URL + service role key)

## Implementation notes (built 2026-10-13)

The app is built; see `../README.md` for setup and commands. Where the build
differs from these docs:

- **Database access.** Each app has its own Postgres role and schema in the
  shared Supabase project (`supabase/bootstrap.sql`) and connects with
  `DATABASE_URL` through postgres.js, instead of `SUPABASE_URL` plus a
  service-role key. Isolation comes from Postgres grants, not RLS, and
  `check:setup` verifies it.
- **Shared code.** It lives in the monorepo packages `@pod/ai`, `@pod/rag`,
  `@pod/db`, `@pod/eval` and `@pod/ui` rather than being copied between apps.
- **Commands.** They are `pnpm` scripts. From the repo root, use
  `pnpm --filter <app> <script>`.
