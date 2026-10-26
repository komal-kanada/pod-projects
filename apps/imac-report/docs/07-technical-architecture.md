# Technical Architecture

## 1. Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 App Router + TypeScript |
| UI | Tailwind 4, shadcn/ui, lucide-react, Recharts (re-render extracted charts) |
| LLM | `gemini-3.6-flash` — extraction (vision), analysis, answer (multimodal), judge |
| Embeddings | `gemini-embedding-001`, 768-d |
| DB | Supabase Postgres + pgvector + FTS |
| PDF render / text | `mupdf` (WASM) — page PNGs, structured text with font sizes; `unpdf` fallback |
| Images | `sharp` (crops, resize) |
| Validation / tests | `zod`, `vitest`, `tsx` |

## 2. Runtime

```text
Browser ─POST /api/ask {question, preset}─▶ rag/answer
   ├─ analyze-query (M3+) ∥ embedQuery
   ├─ search (RPC hybrid_search_elements) × sub-queries
   ├─ expand (RPC get_elements + footnote links)
   ├─ diversify → context (text + crops read from public/report/)
   ├─ Gemini generateContentStream (text + inlineData images)
   └─ log query + trace
◀─ NDJSON: analysis → sources (with crop URLs) → trace → tokens → done
```

## 3. API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/ask` | POST `{question, preset?}` | NDJSON answer |
| `/api/retrieve` | POST | Trace + context without generation |
| `/api/pages` | GET `?runId` | Pages: image URL, size, elements (id, type, bbox, title, flags) |
| `/api/elements/[id]` | GET | Element data, derived chunks, footnote links, fidelity status |
| `/api/runs` | GET | Runs (per strategy), active run, presets |

## 4. CLIs

| Command | Purpose |
| --- | --- |
| `npm run render` | PNGs + text layer |
| `npm run extract -- --strategy X0\|X1\|X2\|X3 [--pages] [--force]` | Elements per page, cached |
| `npm run extract:eval -- --strategies X0,X1,X2` | Score vs ground truth → `eval/results/extraction-*.md` |
| `npm run ingest -- --strategy X2 --representation flat\|typed [--activate]` | Build run: elements, links, chunks, embeddings |
| `npm run publish-assets -- --run <id>` | Copy page PNGs + crops to `public/report/` |
| `npm run ask -- "q" --preset M4 --trace` | Terminal answer |
| `npm run eval -- --presets M0,M1,M2,M3,M4 [--no-judge]` | QA ablation |

## 5. Presets

```ts
export const PRESETS = {
  M0: { run: "X0:flat",  search: "vector", analyze: false, expand: false, images: false, visual: false },
  M1: { run: "X1:flat",  search: "vector", analyze: false, expand: false, images: false, visual: false },
  M2: { run: "BEST:typed", search: "vector", analyze: false, expand: true, images: false, visual: false },
  M3: { run: "BEST:typed", search: "hybrid", analyze: true,  expand: true, images: false, visual: false },
  M4: { run: "BEST:typed", search: "hybrid", analyze: true,  expand: true, images: true,  visual: false },
  M5: { run: "BEST:typed", search: "hybrid", analyze: true,  expand: true, images: true,  visual: true  },
} as const;
```

`BEST` = strategy chosen in Phase 2 (`config.extraction.chosen`).

## 6. Environment

```bash
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
# optional
VISUAL_EMBEDDINGS_PROVIDER=     # M5: vertex | cohere | voyage
VISUAL_EMBEDDINGS_API_KEY=
EXTERNAL_PARSER=                # X3: llamaparse | docling | azure
EXTERNAL_PARSER_API_KEY=
```

## 7. Key decisions

| # | Decision | Alternatives | Why |
| --- | --- | --- | --- |
| D1 | Element model; chunks derived from elements | Chunk the text | Content types need different representations; context needs the whole element |
| D2 | Gemini vision extraction with bboxes | Text layer + heuristics only; external parser | Charts carry data only in pixels; bboxes enable crops and verification; no extra provider |
| D3 | Strategies behind one interface, scored on ground truth | Pick one by intuition | The brief asks to *explore*; evidence over opinion |
| D4 | Text layer as numeric ground truth | Trust the model | Vision models misread digits; text layer is exact when present |
| D5 | `labelled` vs `estimated` chart values | Extract all values | Never state eyeballed values as report facts |
| D6 | Row sentences + chart facts for retrieval | Embed whole tables/charts | Cell-level questions need cell-level vectors |
| D7 | Footnotes linked both ways | Footnotes as ordinary text | Conditions/methodology must travel with the claim |
| D8 | Units/glossary normalisation in a separate FTS column | Normalise displayed text | Keep the report's exact wording for display and citation |
| D9 | Crops sent to the answer model (M4) | Text only | Model can verify and read what extraction missed |
| D10 | Page images in `public/report/` (committed) | Supabase Storage | One small document; zero infra; works on any host |
| D11 | Overrides allowed but excluded from extraction scores | No overrides / hidden fixes | Usable app *and* honest comparison |
