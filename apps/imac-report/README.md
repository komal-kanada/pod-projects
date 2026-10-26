# Apple iMac Environmental Report · Multimodal document RAG

In this report the answers live in tables, charts, footnotes and callouts, so
the unit here is the **element**, not the paragraph. Several extraction
strategies are built behind one interface and **scored against hand-labelled
ground truth**. Each element gets retrievable forms (row sentences, chart
facts, linked footnotes). The answer model reads whole elements, and in M4 it
also sees the original crop.

Design docs: [`docs/`](docs/README.md) (start with `PLAN.md`).

## Setup (once)

1. Run [`supabase/bootstrap.sql`](supabase/bootstrap.sql) in the Supabase SQL
   editor, after setting a password. It creates schema `imac` owned by role
   `imac_app`.
2. `cp .env.example .env.local`, then set `DATABASE_URL`
   (`imac_app.<project-ref>`, pooler port 6543) and `GEMINI_API_KEY`.
   `X3_MODEL` is optional. Add the same variables to the Vercel project.
3. `pnpm --filter imac-report db:migrate`
4. The PDF goes in `data/imac-environmental-report.pdf`, and the sample
   questions go into `eval/questions.json`.
5. `pnpm --filter imac-report check:setup`

## Pipeline (inside `apps/imac-report`)

| Command | What it does |
| --- | --- |
| `pnpm render` | Page PNGs (170 DPI) plus the text layer with font sizes and superscript markers (mupdf) |
| — | **Label `eval/ground-truth/*.json` by hand** (tables, charts, footnotes, facts per page) |
| `pnpm extract --strategy X0,X1,X2` | Elements per page for each strategy, cached and resumable |
| `pnpm extract:eval --strategies X0,X1,X2` | Scores each strategy against the ground truth → `eval/results/extraction-*.md`; set `CONFIG.extraction.chosen` from the result |
| `pnpm ingest --activate` | Builds the `X0:flat` (M0), `X1:flat` (M1) and `<chosen>:typed` (M2–M4) runs, and publishes page images and crops to `public/report/` (commit them) |
| `pnpm ask "q" --preset M4 --trace` | Answers in the terminal |
| `pnpm eval --presets M0,M1,M2,M3,M4` | QA ablation, category × preset, flip list → `eval/results/*-qa.md` |
| `pnpm test` | Rendering via mupdf, extraction post-processing, scoring, and an end-to-end M0–M4 run on in-memory Postgres |

## Strategies and presets

| Strategy | How |
| --- | --- |
| X0 | Text layer only: positions, font sizes, heuristic headings and footnotes |
| X1 | Gemini reads the page image (plus the text layer as a hint) → elements with boxes |
| X2 | X1, plus a focused 300-DPI pass on every table and chart (kept only if at least as faithful) |
| X3 | X2 with a stronger model (`X3_MODEL`) |

| Preset | Adds |
| --- | --- |
| M0 | Baseline: X0 text, flat chunks, vector search |
| M1 | X1 elements as flat page text |
| M2 | Typed representations (row sentences, chart facts, footnotes, callouts) and whole-element expansion |
| M3 | Hybrid search with unit and term normalisation, glossary, type boosts, variant filter, query analysis |
| M4 | Crops of the top tables and charts sent to the answer model (default) |
| M5 | Visual retrieval: not set up (needs a multimodal embedding provider) |

Rules that hold throughout: values not printed on a chart are `estimated`,
never turned into facts, and flagged if an answer states them as exact.
Footnotes travel with what they qualify. Overrides (`data/overrides.json`)
never count toward the extraction scores.

## Screens

- **Ask:** source cards drawn per type. Tables show their matched rows,
  charts are redrawn next to the original crop, and footnotes show what
  references them. A warning appears when the model reports that an image
  disagrees with the extracted data.
- **Explorer:** each page with element boxes coloured by type. Selecting an
  element shows its data, fidelity, footnote links, derived chunks, and a diff
  against the ground truth. A second strategy's boxes can be shown side by
  side.
- **Inspect:** chunk hits by kind (vector and keyword ranks, boosts), the
  elements they expand to, and the final context with any images attached.

## Differences from the original docs

- Database access uses a dedicated role and schema through `DATABASE_URL`,
  with no Supabase keys.
- X3 is "X2 with a stronger model" rather than an external parser adapter.
- M5 is defined but not implemented.
- The chunk browser lives in the Explorer's element panel ("Derived chunks").
