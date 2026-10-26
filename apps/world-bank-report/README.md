# World Bank Economic Report · Advanced document RAG

Retrieval over a ~200-page report that uses the document's **structure**:
Gemini reads pages into typed markdown (checked against the text layer), a
section tree is built from the PDF outline plus the headings, small chunks are
retrieved with hybrid search and metadata filters, and the hits expand back to
their sections within a token budget. Each technique is a **preset** (B0–B6),
so the eval can show what each one adds.

Design docs: [`docs/`](docs/README.md) (start with `PLAN.md`).

## Setup (once)

1. Run [`supabase/bootstrap.sql`](supabase/bootstrap.sql) in the Supabase SQL
   editor, after setting a password. It creates schema `worldbank` owned by
   role `worldbank_app`.
2. `cp .env.example .env.local`, then set `DATABASE_URL` (as
   `worldbank_app.<project-ref>`, pooler port 6543) and `GEMINI_API_KEY`. Add
   both to the Vercel project too.
3. `pnpm --filter world-bank-report db:migrate`
4. The PDF goes in `data/world-bank-report.pdf`, and the sample questions go
   verbatim into `eval/questions.json`.
5. `pnpm --filter world-bank-report check:setup`

## Pipeline commands (inside `apps/world-bank-report`)

| Command | What it does |
| --- | --- |
| `pnpm parse` | Text layer, outline and labels, then Gemini page → markdown (cached per page, resumable), then the fidelity check. `--pages 40-45 --force` re-parses pages; `--text-only` skips Gemini |
| `pnpm tree` | Builds the section tree → `data/cache/tree.json` and prints it. Check it against the contents page |
| `pnpm ingest --kind all --summaries --activate` | Builds the `flat:text` (B0), `flat:markdown` (B1) and `hierarchical` (B2–B6) runs |
| `pnpm ask "q" --preset B5 --trace` | Answers in the terminal, with every stage's timing |
| `pnpm eval --presets B0,B1,B2,B3,B4,B5,B6 --no-judge` | Retrieval ablation → `eval/results/*-ablation.md` |
| `pnpm eval --presets B0,B3,B5,B6` | Full ablation with the LLM judge, plus the flip list |
| `pnpm test` | Unit tests, plus an end-to-end run of every preset on in-memory Postgres |

## Presets

| Preset | Adds |
| --- | --- |
| B0 | Baseline: text layer, flat 3200-char chunks, vector top-6 |
| B1 | Gemini markdown parsing |
| B2 | Section tree, child/table/figure chunks, contextual header, small-to-big context |
| B3 | Hybrid search (vector ⊕ full-text, RRF) |
| B4 | Query analysis: intent, rewrite, sub-queries, validated soft filters |
| B5 | Gemini listwise rerank (default) |
| B6 | Section summaries for routing broad questions |

## Screens

- **Ask:** preset picker, "Understood as" chips, the answer with section and
  page citations, sources grouped by section, and the retrieval trace.
- **Document map:** the section tree with page ranges, token counts, regions,
  summaries and chunks.
- **Inspect:** analysis, candidates (vector and keyword ranks), rerank scores,
  and context blocks with a budget bar. Two presets can be compared side by
  side.

## Differences from the original docs

- Database access uses a dedicated role and schema through `DATABASE_URL`
  (postgres.js), with no Supabase keys.
- One run kind is active at a time per kind (`flat:text`, `flat:markdown`,
  `hierarchical`), so all presets work side by side.
- Not exercised offline: B6 summary generation and Gemini parsing. Both need
  the real key; the end-to-end test covers B0–B5 with a stub model.
