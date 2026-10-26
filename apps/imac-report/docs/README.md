# Apple iMac Environmental Report — Multimodal / Complex Document RAG · Docs

Start here. Read in this order.

| # | File | What it answers |
| --- | --- | --- |
| — | [PLAN.md](PLAN.md) | Phases, order, verification |
| 01 | [01-prd.md](01-prd.md) | Problem, scope, requirements, success criteria |
| 02 | [02-project-structure.md](02-project-structure.md) | Folder layout, modules |
| 03 | [03-rag-architecture.md](03-rag-architecture.md) | End-to-end architecture, presets M0–M5 |
| 04 | [04-parsing-and-extraction.md](04-parsing-and-extraction.md) | Page rendering, element detection, tables, charts, footnotes, callouts; extraction strategies X0–X3 |
| 05 | [05-element-model-and-chunking.md](05-element-model-and-chunking.md) | Element model, retrievable representations per type, metadata, units and synonyms |
| 06 | [06-retrieval-and-generation.md](06-retrieval-and-generation.md) | Hybrid + type-aware retrieval, element expansion, multimodal generation |
| 07 | [07-technical-architecture.md](07-technical-architecture.md) | Stack, routes, CLIs, config, decisions |
| 08 | [08-database-schema.md](08-database-schema.md) | Tables, functions, asset storage |
| 09 | [09-prompts.md](09-prompts.md) | Extraction, chart, table, query, answer, judge prompts |
| 10 | [10-evaluation.md](10-evaluation.md) | Extraction eval + QA eval + ablation |
| 11 | [11-ui.md](11-ui.md) | Ask, Document Explorer, Inspect |

## One-line summary

> Treat every page as a set of typed **elements** — text, tables, charts,
> footnotes, callouts — extract each with the technique that suits it, give
> each a **retrievable text form** (row sentences, chart facts, linked
> footnotes), retrieve across types, and let Gemini **see the original crop**
> when answering — with extraction accuracy and answer accuracy both measured.

## Relationship to the other POD projects

| Project | Hard part | Reused here |
| --- | --- | --- |
| gpo-report | Baseline RAG | Gemini client, embeddings, citations, eval core, M0 baseline |
| world-bank-report | Long, structured docs | Hybrid search SQL, presets/ablation harness, trace |
| **imac-report** | **Information in tables, charts, footnotes** | — |

## Inputs still needed

- [ ] The Apple iMac Environmental Report PDF → `data/imac-environmental-report.pdf`
- [ ] The sample questions → `eval/questions.json`
- [ ] `GEMINI_API_KEY`, Supabase project
- [ ] (Optional, M5 / X3 only) a multimodal embedding or external parser API key

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
