# Build Plan

Ten phases. The baseline (B0) goes end-to-end **early** (Phase 4) so every
advanced technique after it is measured against a working reference, not
built blind.

| Phase | Name | Output | Preset unlocked |
| --- | --- | --- | --- |
| 0 | Setup + inputs | App scaffold, DB, PDF, questions | — |
| 1 | Parse + verify | Cached page markdown, fidelity report | — |
| 2 | Blocks + tree | `tree.json`, Document Map (from file) | — |
| 3 | Chunking + metadata + ingest | Flat and hierarchical runs in DB | — |
| 4 | Baseline end-to-end + eval harness | Ask, `/api/ask`, `npm run eval` | B0, B1, B2 |
| 5 | Hybrid search + filters | `hybrid_search`, soft filters | B3 |
| 6 | Query analysis | Intent, rewrite, sub-queries, validated filters | B4 |
| 7 | Rerank + context assembly polish | Listwise rerank, budget, trace UI | B5 |
| 8 | Summaries + routing | Summary nodes, `/map` summaries | B6 |
| 9 | Ablation + experiments + write-up | EVAL-RESULTS.md, default preset chosen | — |

---

## Phase 0 — Setup + inputs

1. Scaffold Next.js + shadcn in `world-bank-report/`.
2. Deps: `@google/genai`, `@supabase/supabase-js`, `unpdf`, `pdf-lib`, `remark`,
   `remark-gfm`, `zod`, `tsx`, `vitest`, `react-markdown`.
3. Copy shared modules from gpo-report (02 §Reused).
4. `config.ts` with presets, `env.ts`, `.env.example`, `check-setup.mjs`.
5. Supabase migrations 0001–0004.
6. PDF → `data/world-bank-report.pdf`; sample questions → `eval/questions.json`.

**Verify:** `check:setup` green, `build` passes.

## Phase 1 — Parse + verify

1. `text-layer.ts`, `outline.ts` (+ labels).
2. `page-markdown.ts` with batching, caching, resume, `--pages`.
3. `fidelity.ts` + re-parse / fallback logic.
4. `npm run parse`.

**Verify:** fidelity summary reviewed; checklist in 04 §7 items 2–5 done by hand.
Decide Flash vs Pro for parsing based on table accuracy. Write findings to
`docs/EVAL-RESULTS.md › Parsing`.

## Phase 2 — Blocks + tree

1. `blocks.ts` (mdast → typed blocks, cross-page joins, footnote attachment) + tests.
2. `tree.ts` (outline skeleton + headings, region inheritance, retrievable flags) + tests.
3. `npm run tree`.

**Verify:** printed outline matches the PDF contents page (04 §7 item 1); every
page belongs to exactly one leaf section.

## Phase 3 — Chunking + metadata + ingest

1. `chunking/flat.ts` (B0/B1), `hierarchical.ts`, `special-blocks.ts`,
   `contextual-header.ts` + tests (size bounds, no cross-section, table header
   repetition, placeholders).
2. `metadata/vocab.ts`, `extract.ts` + tests (aliases, FY years, forecast markers).
3. `ingest/pipeline.ts`, `scripts/ingest.ts`, `activate.ts`.
4. Ingest: `flat:text`, `flat:markdown`, `hierarchical`.

**Verify:** run stats per content type look sane (05 §6); spot-check 10 chunks'
metadata by hand; no null embeddings; idempotent re-run.

## Phase 4 — Baseline end-to-end + eval harness

1. `search.ts` (vector mode), `context.ts` (raw + smallToBig), `retrieval/pipeline.ts`
   with trace.
2. Answer prompt, `rag/answer.ts`, `citations.ts`, `/api/ask`, `/api/retrieve`.
3. Ask screen (without analysis chips), basic trace panel; `npm run ask`.
4. Complete the gold set (10 §1) — answers, pages, sections, added questions.
5. `lib/eval/*` + `npm run eval` with multi-preset comparison.
6. Run B0, B1, B2.

**Verify:** all three presets produce results; manual review done; B0 numbers
recorded as **the baseline** in EVAL-RESULTS.md.

## Phase 5 — Hybrid search + filters

1. `hybrid_search` modes + filters, soft relaxation in `search.ts`.
2. `/inspect` candidates tab with vRank/kRank.

**Verify:** B3 eval (retrieval-only first); inspect flips vs B2.

## Phase 6 — Query analysis

1. Analyze prompt + schema, vocab validation, fallback.
2. Sub-query search with quotas; analysis chips in Ask.
3. Unit tests: filter validation, relaxation order, quotas.

**Verify:** B4 eval; check analysis JSON for all gold questions by eye (wrong
filters are the main risk). Comparison category should move most.

## Phase 7 — Rerank + context assembly

1. `rerank.ts` with fallback.
2. Finish `context.ts`: windows, merge, dedupe, budget, document ordering + tests.
3. `/api/sections`, `/api/chunks`, full `/inspect` stage tabs, budget bar.

**Verify:** B5 eval; context precision and context tokens reported; latency within
NFR.

## Phase 8 — Summaries + routing

1. `summaries.ts` bottom-up with cache; ingest `--summaries`.
2. `match_summaries`, `section_descendants`, `summary-route.ts`.
3. `/map` with summaries.

**Verify:** B6 eval; `summary` and `cross_section` categories compared to B5.

## Phase 9 — Ablation + experiments + write-up

1. Full ablation run B0–B6 with judge.
2. Experiments E1–E7 (10 §4) as time allows, one variable at a time.
3. Choose `DEFAULT_PRESET` = best quality/cost trade-off.
4. `docs/EVAL-RESULTS.md`: ablation table, per-category table, flip analysis,
   failure causes, recommendations, what didn't help.
5. README with architecture diagram and commands. UI polish.

**Verify:** fresh setup from README works; `build`, `lint`, `test` clean; every
provided sample question answered correctly in the UI with the default preset
or its failure explained.

---

## Definition of done

- [ ] Provided sample questions validated (answers + citations) with the default preset.
- [ ] Ablation table B0→B6 with honest deltas, including techniques that didn't help.
- [ ] Hit@5 and correctness improved over B0 (PRD §7 targets met or gap explained).
- [ ] Document Map reflects the real report structure.
- [ ] Every stage visible in the trace; every module commented.
