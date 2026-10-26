# World Bank Economic Report — Advanced Document RAG · Docs

Start here. Read in this order.

| # | File | What it answers |
| --- | --- | --- |
| — | [PLAN.md](PLAN.md) | Phases, order, verification for each phase |
| 01 | [01-prd.md](01-prd.md) | Problem, scope, requirements, success criteria |
| 02 | [02-project-structure.md](02-project-structure.md) | Folder layout, module responsibilities |
| 03 | [03-rag-architecture.md](03-rag-architecture.md) | End-to-end architecture and the pipeline presets (B0…B6) |
| 04 | [04-document-processing.md](04-document-processing.md) | Parsing a 200-page structured PDF: layout, tables, figures, boxes, footnotes, document tree |
| 05 | [05-chunking-and-metadata.md](05-chunking-and-metadata.md) | Hierarchical chunking, special blocks, summaries, metadata extraction |
| 06 | [06-retrieval-and-context.md](06-retrieval-and-context.md) | Query analysis, hybrid search, filters, rerank, small-to-big, context budget |
| 07 | [07-technical-architecture.md](07-technical-architecture.md) | Stack, routes, CLIs, config, decisions |
| 08 | [08-database-schema.md](08-database-schema.md) | Tables, indexes, SQL functions |
| 09 | [09-prompts.md](09-prompts.md) | Page parsing, summaries, query analysis, rerank, answer, judge prompts |
| 10 | [10-evaluation.md](10-evaluation.md) | Gold set, metrics, ablation ladder, targets |
| 11 | [11-ui.md](11-ui.md) | Ask (with retrieval trace), Document Map, Inspect |

## One-line summary

> Turn a ~200-page World Bank report into a **section tree** of typed,
> metadata-rich chunks; retrieve with **hybrid search + filters + reranking**,
> assemble context **small-to-big within a token budget**, answer with
> section-and-page citations — and **prove each technique's value** with an
> ablation over the sample questions.

## Relationship to the GPO project

`gpo-report` is the **baseline** RAG. This project starts from that pipeline
(preset **B0**) and adds advanced techniques one at a time. Shared modules
(Gemini client, embeddings, NDJSON, citations, eval metrics) are copied from
`gpo-report` and extended.

## Inputs still needed

- [ ] The World Bank Economic Report PDF → `data/world-bank-report.pdf`
- [ ] The sample questions → `eval/questions.json` (format in 10-evaluation.md)
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
