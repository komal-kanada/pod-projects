# Project Structure

```text
imac-report/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                        # Ask
│   ├── explorer/page.tsx               # Page image + element boxes + extracted data
│   ├── inspect/page.tsx                # Retrieval stages, chunk browser
│   └── api/
│       ├── ask/route.ts                # NDJSON: analysis, sources, trace, tokens, done
│       ├── retrieve/route.ts
│       ├── pages/route.ts              # Pages with element list (for Explorer)
│       ├── elements/[id]/route.ts      # One element with derived chunks + links
│       └── runs/route.ts
│
├── components/
│   ├── ask/        question-form, preset-select, answer, source-card,
│   │               source-table, source-chart (Recharts from extracted data), source-footnote
│   ├── explorer/   page-canvas (image + bbox overlay), element-panel, strategy-diff
│   ├── inspect/    stage-tabs, chunk-browser
│   └── ui/
│
├── lib/
│   ├── config.ts                       # Tunables + PRESETS M0…M5 + EXTRACTION_STRATEGIES
│   ├── env.ts  ndjson.ts  tokens.ts
│   ├── ai/         gemini.ts  embeddings.ts  prompts.ts
│   ├── render/
│   │   ├── pages.ts                    # mupdf: page → PNG (+ size), cached
│   │   ├── text-layer.ts               # unpdf/mupdf: words with bbox, font size (superscripts)
│   │   └── crop.ts                     # sharp: bbox → padded crop PNG
│   ├── extract/
│   │   ├── strategies/
│   │   │   ├── x0-text-layer.ts        # Text only, heuristic footnotes
│   │   │   ├── x1-page-elements.ts     # Gemini page image → elements JSON with bboxes
│   │   │   ├── x2-focused.ts           # X1 + focused pass per chart/table crop
│   │   │   └── x3-external.ts          # Optional: Pro model or external parser adapter
│   │   ├── tables.ts                   # Normalise table JSON, merge multi-page, units
│   │   ├── charts.ts                   # Normalise chart JSON, labelled/estimated
│   │   ├── footnotes.ts                # Marker detection + linking
│   │   ├── callouts.ts
│   │   ├── fidelity.ts                 # Numbers vs text layer
│   │   └── run.ts                      # Strategy runner, cache, resume
│   ├── represent/
│   │   ├── table-rows.ts               # Row → sentence
│   │   ├── chart-facts.ts              # Point/series → sentence
│   │   ├── footnote-attach.ts          # Append linked footnotes to chunks
│   │   ├── text-chunks.ts              # Section-aware text chunks
│   │   └── header.ts                   # Contextual header (page, section, type, variant)
│   ├── normalize/
│   │   ├── units.ts                    # CO₂e/CO2e, kWh, kg, %, g → canonical
│   │   └── glossary.ts                 # Domain synonyms for FTS + query rewrite
│   ├── ingest/pipeline.ts
│   ├── retrieval/
│   │   ├── analyze-query.ts            # intent, target types, variant, rewrite
│   │   ├── search.ts                   # hybrid + type boosts + filters
│   │   ├── expand.ts                   # derived chunk → parent element (+ footnotes)
│   │   ├── diversify.ts                # Type diversity / dedupe
│   │   ├── rerank.ts                   # Optional
│   │   ├── context.ts                  # Text blocks + image parts, budget
│   │   └── pipeline.ts
│   ├── rag/        answer.ts  citations.ts
│   ├── eval/
│   │   ├── extraction/  load-gt.ts  table-score.ts  chart-score.ts  footnote-score.ts  report.ts
│   │   └── qa/          load.ts  metrics.ts  numeric.ts  judge.ts  report.ts
│   └── supabase/admin.ts
│
├── scripts/
│   ├── check-setup.mjs
│   ├── render.ts                       # npm run render
│   ├── extract.ts                      # npm run extract -- --strategy X2 [--pages 3-5]
│   ├── extract-eval.ts                 # npm run extract:eval -- --strategies X0,X1,X2
│   ├── ingest.ts                       # npm run ingest -- --strategy X2 --representation full
│   ├── publish-assets.ts               # copy page PNGs/crops for the chosen run to public/report/
│   ├── ask.ts
│   └── eval.ts
│
├── eval/
│   ├── questions.json
│   ├── ground-truth/                   # Hand-labelled elements: tables, charts, footnotes
│   │   ├── tables.json  charts.json  footnotes.json  coverage.json
│   └── results/
│
├── data/
│   ├── imac-environmental-report.pdf
│   └── cache/                          # gitignored
│       ├── pages/page-01.png …
│       ├── text-layer/page-01.json …
│       └── extract/<strategy>/page-01.json …
│
├── public/report/                      # committed: page images + crops of the active run
├── supabase/migrations/ 0001…0005
├── types/index.ts                      # Element (union), DerivedChunk, Footnote link, Preset…
└── docs/
```

## Rules

1. Each extraction strategy implements one interface:
   `extractPage(page: RenderedPage, ctx) => Promise<Element[]>` — so strategies are
   swappable and comparable.
2. Elements are the source of truth; chunks are **derived** from elements and always
   carry `element_id`.
3. All expensive LLM work is cached by `sha256(page image) + strategy + prompt version`.
4. `lib/` never imports from `app/`.

## Reused

| From | Module |
| --- | --- |
| gpo-report | `gemini.ts`, `embeddings.ts`, `citations.ts`, judge, base metrics |
| world-bank-report | `hybrid_search` SQL pattern, presets + ablation `eval/compare.ts`, trace, rerank |
