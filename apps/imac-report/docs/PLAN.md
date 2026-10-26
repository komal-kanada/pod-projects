# Build Plan

Nine phases. Extraction is built and **measured** before anything is embedded:
if a chart value is wrong in the elements, no retrieval technique will fix it.

| Phase | Name | Output | Unlocks |
| --- | --- | --- | --- |
| 0 | Setup + inputs | Scaffold, DB, PDF, questions | — |
| 1 | Render + ground truth | Page PNGs, text layer, hand-labelled GT | — |
| 2 | Extraction strategies + comparison | X0, X1, X2 (X3), `extract:eval`, EXTRACTION-RESULTS.md | chosen strategy |
| 3 | Element model + representations + ingest | Footnote links, row sentences, chart facts, normalisation, runs in DB | — |
| 4 | Baseline end-to-end + QA harness | Ask (basic), `/api/ask`, `npm run eval` | M0, M1, M2 |
| 5 | Hybrid + type-aware retrieval | Query analysis, glossary, boosts, variants, diversify | M3 |
| 6 | Multimodal generation | Crops in context, disagreement logging, rich source cards | M4 |
| 7 | Explorer + Inspect | Page overlay, strategy compare, GT diff, stage tabs | — |
| 8 | Ablation + experiments + write-up | EVAL-RESULTS.md, default preset; M5 if time/keys | (M5) |

---

## Phase 0 — Setup + inputs

1. Scaffold Next.js + shadcn in `imac-report/`.
2. Deps: `@google/genai`, `@supabase/supabase-js`, `mupdf`, `unpdf`, `sharp`, `zod`,
   `recharts`, `react-markdown`, `tsx`, `vitest`.
3. Copy shared modules (02 §Reused).
4. `config.ts` (presets, strategies), `env.ts`, `.env.example`, `check-setup.mjs`.
5. Migrations 0001–0005.
6. PDF → `data/`; sample questions → `eval/questions.json`.

**Verify:** `check:setup` green; `build` passes; `mupdf` renders page 1 to PNG.

## Phase 1 — Render + ground truth

1. `render/pages.ts`, `text-layer.ts` (with font size / superscript detection), `crop.ts`.
2. `npm run render`.
3. Inventory the report by hand: every table, chart, footnote, callout per page.
4. Write `eval/ground-truth/*.json` (10 §1).
5. Fill `expected_answer`, `expected_values`, `expected_elements` for the provided
   sample questions while the PDF is open.

**Verify:** GT covers every table/chart/footnote; superscript detection finds the
footnote markers you see on 3 sample pages.

## Phase 2 — Extraction strategies + comparison

1. `Element` types + strategy interface.
2. X0 text-layer strategy.
3. X1 page-elements strategy (prompt 09 §1, `responseSchema`, cache).
4. X2 focused pass (crop at 300 DPI, prompts 09 §2–3).
5. Post-processing: `fidelity.ts`, `tables.ts`, `charts.ts`, `footnotes.ts`,
   `callouts.ts` + unit tests.
6. `lib/eval/extraction/*`, `npm run extract:eval`.
7. (Optional) X3.

**Verify:** extraction report generated; every error class understood (look at the
diffs); `EXTRACTION-RESULTS.md` written; chosen strategy set in config.

## Phase 3 — Element model + representations + ingest

1. `represent/*` (text chunks, row sentences, chart facts, footnote attach, header) + tests.
2. `normalize/units.ts`, `glossary.ts` + tests.
3. `ingest/pipeline.ts`: pages, elements, links, chunks, embeddings; `publish-assets`.
4. Ingest runs: `X0:flat`, `X1:flat`, `<chosen>:typed`.

**Verify:** element/chunk counts match extraction; every footnote link present in
DB; no null embeddings; crops exist for all table/chart/callout elements.

## Phase 4 — Baseline end-to-end + QA harness

1. `search.ts` (vector), `expand.ts`, `context.ts` (text only), `retrieval/pipeline.ts`
   with trace.
2. Answer prompt, `rag/answer.ts`, citations, `/api/ask`, `/api/retrieve`.
3. Ask screen with basic source cards; `npm run ask`.
4. Complete gold set (10 §2.1) with added questions.
5. `lib/eval/qa/*` incl. `numeric.ts`; `npm run eval`.
6. Run M0, M1, M2.

**Verify:** results file; M0 recorded as baseline; manual review with cause tags.

## Phase 5 — Hybrid + type-aware retrieval

1. `hybrid_search_elements` usage, glossary expansion, boosts, variant filter + fallback.
2. `analyze-query.ts` with validation; `diversify.ts`.
3. Analysis chips in Ask.

**Verify:** M3 eval; check analysis JSON for every gold question; per-category deltas.

## Phase 6 — Multimodal generation

1. Image parts in `context.ts`; prompt rules 5; disagreement parsing + logging.
2. Rich source cards: `SourceTable`, `SourceChart` (Recharts + crop), `SourceFootnote`, `SourceCallout`.

**Verify:** M4 eval; latency within NFR; review every logged disagreement against
the PDF (each one is either a real extraction error → fix/override, or a model error).

## Phase 7 — Explorer + Inspect

1. `/api/pages`, `/api/elements/[id]`.
2. `PageCanvas` with SVG overlay, `ElementPanel`, `StrategyCompare`, `GroundTruthDiff`.
3. Inspect stage tabs.

**Verify:** every page browsable; boxes align with the image on all pages.

## Phase 8 — Ablation + experiments + write-up

1. Full ablation M0–M4 with judge.
2. Experiments E1–E7 (10 §2.4) as time allows.
3. M5 if a multimodal embedding key is available.
4. `DEFAULT_PRESET` = best quality/latency.
5. `docs/EVAL-RESULTS.md`: ablation, category × preset table, flip list, failure
   causes, what didn't help. README with architecture + commands. UI polish.

**Verify:** fresh setup from README works; `build`, `lint`, `test` clean; every
provided sample question answered correctly with correct source element, or the
failure explained.

---

## Definition of done

- [ ] Extraction strategies compared with numbers; choice justified in EXTRACTION-RESULTS.md.
- [ ] Every table, chart, footnote in the report is browsable in Explorer and searchable.
- [ ] Provided sample questions validated with the default preset.
- [ ] Category × preset table shows the effect on table/chart/footnote questions.
- [ ] Zero estimated chart values stated as exact.
