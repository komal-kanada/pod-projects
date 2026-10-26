# Build Plan

Eight phases. Each ends with a **verify** step: a concrete check that must pass
before moving on. The pipeline is built and checked stage by stage, because a
RAG bug in parsing is invisible by the time you look at the answer.

| Phase | Name | Output | Needs keys? |
| --- | --- | --- | --- |
| 0 | Setup + inputs | Scaffolded app, DB migrated, PDF + questions in place | Supabase, Gemini |
| 1 | Parse + clean | `npm run parse`, verified pages.json | No |
| 2 | Chunk + embed + store | `npm run ingest`, active run in DB | Yes |
| 3 | Retrieval | `/api/retrieve`, `/inspect` | Yes |
| 4 | Generation | `/api/ask`, Ask screen, `npm run ask` | Yes |
| 5 | Evaluation baseline | `npm run eval`, first results file | Yes |
| 6 | Measured improvements | Experiment rows in EVAL-RESULTS.md | Yes |
| 7 | Polish + write-up | README, EVAL-RESULTS.md, demo | — |

---

## Phase 0 — Setup + inputs

1. `create-next-app` in `gpo-report/` (TS, App Router, Tailwind, ESLint); add shadcn.
2. Add deps: `@google/genai`, `@supabase/supabase-js`, `unpdf`, `zod`, `tsx`, `vitest`,
   `react-markdown`.
3. Copy reusable modules from interview-prep (see 02 §Reused).
4. `lib/config.ts`, `lib/env.ts`, `.env.example`, `scripts/check-setup.mjs`.
5. Supabase project → run migrations 0001–0004.
6. Put the PDF at `data/gpo-annual-report.pdf`.
7. Put the sample questions in `eval/questions.json` (questions only for now).

**Verify:** `npm run check:setup` green; `npm run build` passes.

## Phase 1 — Parse + clean (no API calls)

1. `parser.ts` — pages, page labels, outline.
2. `cleaner.ts` — steps in 03 §2, each a pure function.
3. `structure.ts` — section paths from outline, heuristic fallback.
4. `scripts/parse.ts` — writes `data/parsed/pages.json` + prints: page count, pages
   with no text, headers/footers removed, sections found.
5. Unit tests for cleaner functions.

**Verify (by hand):** open pages.json and compare 5 pages with the PDF — the cover,
a narrative page, a **table page**, a multi-column page if any, and the last page.
Write down in `docs/EVAL-RESULTS.md › Parsing notes` what's broken. Fix what's
cheap; record the rest as known limitations.

## Phase 2 — Chunk + embed + store

1. `chunker.ts` (03 §4) + unit tests: size bounds, overlap, no cross-section chunks,
   page ranges correct.
2. `parse.ts` also writes `chunks.preview.json` — check chunk stats before paying for
   embeddings.
3. `embeddings.ts` — batching, task types, normalisation, retries.
4. `pipeline.ts` + `scripts/ingest.ts` + `scripts/activate.ts`.

**Verify:** run ingest → run is `completed`, `chunk_count` matches preview, no
null embeddings, every vector has norm ≈ 1. Re-run → no-op (idempotent).

## Phase 3 — Retrieval

1. `retrieval/vector.ts`, `retrieval/retrieve.ts` (model/dims check against run).
2. `/api/retrieve`, `/api/chunks`, `/api/runs`.
3. `/inspect` page.
4. Fill `expected_pages` for the sample questions now (you'll be looking at the PDF anyway).

**Verify:** `npm run eval -- --no-judge` (retrieval-only path of the harness can be
built here) — note Hit@6 for the sample questions. For every miss, use the chunk
browser to see why before going further.

## Phase 4 — Generation

1. `prompts.ts` (06 §1), `rag/context.ts`, `rag/citations.ts` + tests.
2. `rag/answer.ts` — streaming + non-streaming variants, query logging.
3. `/api/ask` (NDJSON) + rate limit.
4. Ask screen (08 §1).
5. `scripts/ask.ts`.

**Verify:** ask every sample question in the UI. Each answer has citations, badges
map to the right pages, an out-of-scope question returns the exact refusal, the
`queries` table has rows.

## Phase 5 — Evaluation baseline

1. Complete `eval/questions.json` (07 §1): answers, must_include, pages, plus added
   paraphrase / out-of-scope / multi-hop / numeric questions.
2. `lib/eval/*` + `scripts/eval.ts` — metrics, judge, report.
3. Run it. Do the manual review (07 §2).
4. Start `docs/EVAL-RESULTS.md` with the **baseline (E0)** row.

**Verify:** results file exists, judge agreement ≥ ~90 % on reviewed items, every
failure has a one-line cause written next to it (parse / chunk / retrieval / prompt
/ judge).

## Phase 6 — Measured improvements

Pick experiments from 07 §5 based on the failure causes from Phase 5:
- mostly retrieval misses on exact terms/figures → E4 hybrid (migration 0005);
- answers cut off / split → E1/E2 chunk size and overlap;
- table/numeric failures → E6.

One variable at a time, new ingestion run per chunk config, retrieval metrics first.
Keep a change only if it beats the baseline; activate the winning run.

**Verify:** EVAL-RESULTS.md has a row per experiment with a kept/rejected decision.

## Phase 7 — Polish + write-up

1. README: what it is, setup, commands, architecture diagram, results table.
2. `docs/EVAL-RESULTS.md`: baseline vs final, what helped, what didn't, known
   failures with examples, next steps (reranking, query rewriting).
3. UI pass: empty/loading/error states, mobile, dark mode.
4. Final run of all sample questions in the UI.

**Verify:** fresh clone → README steps → working app; `npm run build`, `npm test`,
`npm run lint` all clean.

---

## Definition of done

- [ ] Every provided sample question answered correctly with a correct page citation
      (or the failure explained in EVAL-RESULTS.md).
- [ ] Out-of-scope questions refused 100 %.
- [ ] Baseline metrics recorded; any improvement backed by an eval run.
- [ ] Pipeline stages are separate, commented modules a reviewer can follow.
