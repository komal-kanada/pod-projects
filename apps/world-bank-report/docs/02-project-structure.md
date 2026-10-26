# Project Structure

One Next.js app. Every pipeline stage is a plain module in `lib/` used by both
API routes and CLI scripts. Each stage is a function with typed input/output
and returns a **trace entry**, so the UI and eval can show what happened.

```text
world-bank-report/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                       # Ask
│   ├── map/page.tsx                   # Document Map (section tree)
│   ├── inspect/page.tsx               # Per-stage retrieval inspector + chunk browser
│   └── api/
│       ├── ask/route.ts               # POST → NDJSON: analysis, sources, trace, tokens, done
│       ├── retrieve/route.ts          # POST → full trace, no generation
│       ├── sections/route.ts          # GET section tree (+ summaries, chunk counts)
│       ├── chunks/route.ts            # GET chunks by section / page / type
│       └── runs/route.ts              # GET ingestion runs, active run, presets
│
├── components/
│   ├── ask/        question-form, preset-select, answer, sources-by-section, trace-panel
│   ├── map/        section-tree, section-detail
│   ├── inspect/    stage-table, chunk-browser
│   └── ui/         shadcn
│
├── lib/
│   ├── config.ts                      # Tunables + PRESETS (B0…B6)
│   ├── env.ts
│   ├── tokens.ts                      # Token estimate (chars/4) + countTokens for budgets
│   ├── ndjson.ts
│   ├── ai/
│   │   ├── gemini.ts                  # Client, models, error mapping, JSON helper
│   │   ├── embeddings.ts              # Batching, task types, normalisation
│   │   └── prompts.ts                 # All prompts, versioned (09-prompts.md)
│   ├── parse/
│   │   ├── text-layer.ts              # unpdf per-page text (ground truth for numbers)
│   │   ├── outline.ts                 # PDF bookmarks + page labels
│   │   ├── page-images.ts             # Split PDF into page batches for Gemini
│   │   ├── page-markdown.ts           # Gemini page → markdown (cached per page)
│   │   ├── fidelity.ts                # Numeric + coverage check, flags pages
│   │   └── blocks.ts                  # Markdown → typed blocks (heading/para/table/figure/box/footnote)
│   ├── structure/
│   │   ├── tree.ts                    # Blocks + outline → section tree
│   │   └── summaries.ts               # Section + chapter summaries (bottom-up)
│   ├── chunking/
│   │   ├── flat.ts                    # B0: GPO-style fixed-size chunks
│   │   ├── hierarchical.ts            # Child chunks inside sections, parent links
│   │   ├── special-blocks.ts          # Tables (row-safe split), figures, boxes
│   │   └── contextual-header.ts       # Breadcrumb header for embed_text
│   ├── metadata/
│   │   ├── vocab.ts                   # World Bank regions, countries, aliases
│   │   ├── extract.ts                 # regions[], countries[], years[], is_forecast
│   │   └── validate.ts                # Validate LLM-proposed filters against vocab
│   ├── ingest/
│   │   └── pipeline.ts                # Orchestrates a run for a preset
│   ├── retrieval/
│   │   ├── analyze-query.ts           # Intent, filters, rewrite, sub-queries
│   │   ├── search.ts                  # vector / keyword / hybrid RPC + filters + fallback
│   │   ├── summary-route.ts           # Search summary nodes → candidate sections
│   │   ├── rerank.ts                  # Gemini listwise rerank
│   │   ├── context.ts                 # Small-to-big, merge, dedupe, order, budget
│   │   └── pipeline.ts                # Runs stages per preset, collects trace
│   ├── rag/
│   │   ├── answer.ts                  # retrieve → prompt → stream → log
│   │   └── citations.ts
│   ├── eval/
│   │   ├── load.ts  metrics.ts  judge.ts  report.ts  compare.ts
│   └── supabase/admin.ts
│
├── scripts/
│   ├── check-setup.mjs
│   ├── parse.ts                       # npm run parse   (Gemini page markdown + fidelity)
│   ├── tree.ts                        # npm run tree    (section tree → JSON, no DB)
│   ├── ingest.ts                      # npm run ingest -- --preset B5
│   ├── activate.ts
│   ├── ask.ts                         # npm run ask -- "q" --preset B5 --trace
│   └── eval.ts                        # npm run eval -- --presets B0,B2,B5
│
├── eval/
│   ├── questions.json
│   └── results/
│
├── data/
│   ├── world-bank-report.pdf
│   └── cache/                         # gitignored
│       ├── text-layer/page-001.txt …
│       ├── markdown/page-001.md …
│       ├── fidelity.json
│       └── tree.json
│
├── supabase/migrations/
│   ├── 0001_extensions.sql
│   ├── 0002_tables.sql
│   ├── 0003_indexes.sql
│   ├── 0004_search_functions.sql
│   └── 0005_context_functions.sql
│
├── types/index.ts                     # Block, Section, Chunk, Metadata, QueryAnalysis, TraceStage, Preset…
└── docs/
```

## Rules

1. `lib/` never imports from `app/` or `components/`.
2. Every tunable lives in `lib/config.ts`; presets are data, not code branches
   scattered around.
3. Every retrieval stage has signature
   `(input, ctx) => Promise<{ output, trace: TraceStage }>`.
4. Expensive LLM steps (page parsing, summaries) are **cached on disk by content
   hash + prompt version** and are resumable.
5. Each module starts with a header comment explaining *why*.

## Reused from gpo-report

| Module | Change |
| --- | --- |
| `lib/ai/gemini.ts`, `embeddings.ts`, `ndjson.ts` | As is |
| `lib/ingest/cleaner.ts` | Used only by B0 flat path and text-layer cleanup |
| `lib/ingest/chunker.ts` | Becomes `chunking/flat.ts` (B0) |
| `lib/rag/citations.ts` | Extended with section breadcrumb |
| `lib/eval/metrics.ts`, `judge.ts`, `report.ts` | Extended: nDCG, section accuracy, context precision, multi-preset compare |
