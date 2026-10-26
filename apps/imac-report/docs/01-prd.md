# PRD — Apple iMac Environmental Report: Multimodal / Complex Document RAG

## 1. Problem statement

Product environmental reports put most of their facts **outside** plain
paragraphs:

| Where the fact lives | Typical content | What text-only RAG does with it |
| --- | --- | --- |
| **Charts** | Life-cycle carbon emissions by phase (production, transport, use, end of life), comparisons with earlier models | Keeps the title and maybe stray labels; values and their meaning are lost |
| **Tables** | Materials, energy consumption by mode, packaging composition, restricted substances | Cells flattened into a stream; numbers detached from row/column headers |
| **Footnotes** | Methodology, assumptions (use period, grid mix), scope of claims, definitions | Text survives, but disconnected from the claim that references it |
| **Callouts / infographics** | "X% recycled content", icons with key figures | Fragments without context, or missing entirely |
| **Plain text** | Narrative claims | Works |

A question like "What share of the iMac's life-cycle emissions comes from
production, and what use period is assumed?" needs a **chart value** and a
**footnote**. Text-only RAG gets neither reliably.

## 2. Objective

> **Handle real-world documents where important information is distributed
> across different content types** — explore and compare parsing/extraction
> techniques that make tables, charts, and footnotes searchable and
> retrievable, and validate with the provided sample questions.

## 3. Users

| User | Need |
| --- | --- |
| Reviewer / mentor | Ask the sample questions; see answers sourced from the right chart/table/footnote; see the extraction comparison |
| Developer | Verify extraction against the original page; debug retrieval per content type |
| Reader | Exact figures with units, the conditions/footnotes behind them, and the page |

## 4. Scope

### Must have

1. **Page rendering** to images; crops of detected elements.
2. **Element extraction** with bounding boxes and types: text, table, chart,
   footnote, callout, image.
3. **Extraction strategy comparison** X0–X2 (X3 optional) scored against a
   hand-labelled ground truth.
4. **Type-specific representations**: table JSON + markdown + row sentences;
   chart JSON + description + fact sentences; footnotes linked both ways;
   callout facts.
5. **Numeric fidelity**: every extracted number checked against the text layer
   where possible; chart values flagged `labelled` vs `estimated`.
6. **Term/unit normalisation** and a domain synonym glossary.
7. **Hybrid, content-type-aware retrieval** with element expansion.
8. **Multimodal generation**: crops of retrieved chart/table elements sent with
   the text context.
9. **Presets M0–M4** and an ablation eval.
10. **UI**: Ask (rich source cards), Document Explorer (page + boxes + extracted
    data), Inspect.

### Should / could

- M5: page/crop image embeddings for visual retrieval (needs a multimodal
  embedding provider).
- X3: Gemini Pro or an external parser (LlamaParse / Docling / Azure Document
  Intelligence) in the extraction comparison.

### Out of scope

- Multiple reports, uploads, auth, conversation memory.
- Generating new charts as answers (we *render extracted* charts in sources only).
- OCR of scanned documents (the report is a digital PDF).

## 5. Functional requirements

| ID | Requirement |
| --- | --- |
| FR-1 | `npm run render` produces page PNGs (≥ 150 DPI) and the text layer with word positions |
| FR-2 | `npm run extract -- --strategy X1` writes elements per page (type, bbox, content) to cache |
| FR-3 | `npm run extract:eval` scores strategies against `eval/ground-truth/*.json` |
| FR-4 | Every table has `columns`, `rows`, `unit`, `footnoteRefs`, markdown, and row sentences |
| FR-5 | Every chart has `chartType`, `title`, axes/series/points with `valueSource: labelled \| estimated`, description, fact sentences |
| FR-6 | Every footnote marker in text/table/chart resolves to a footnote element, or is reported as unresolved |
| FR-7 | Retrieval of any derived chunk (row, fact) returns its parent element in context |
| FR-8 | Numeric answers include the unit and the condition (model/config, phase, assumption) |
| FR-9 | Estimated chart values are never stated as exact; the answer says "approximately" or omits them |
| FR-10 | `/api/ask` accepts `preset`; sources include type, page, bbox, crop URL |
| FR-11 | Explorer shows page image with element boxes and the extracted data side by side |
| FR-12 | `npm run eval -- --presets M0,M2,M4` writes a comparison report |

## 6. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Accuracy | Numbers are the product: extraction verified, never silently estimated |
| Latency | M4 p95 < 10 s (image inputs add time) |
| Cost | Extraction runs once and is cached by page hash + prompt version |
| Transparency | Every answer traceable to an element you can see on the page |
| Security | Keys server-side only; RLS on, no public policies |

## 7. Success criteria (initial)

| Metric | Target |
| --- | --- |
| Table cell accuracy (best strategy) | ≥ 0.97 |
| Chart labelled-value accuracy | ≥ 0.95 |
| Footnote link accuracy | ≥ 0.95 |
| Element Hit@5 (best preset) | ≥ 0.90; ≥ +25 pts over M0 on table/chart/footnote questions |
| Numeric exact match (value + unit) | ≥ 0.85 |
| Answer correctness | ≥ 0.85 |
| Faithfulness | ≥ 0.95 |
| Out-of-scope refusal | 1.00 |

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Vision model misreads chart values | Prefer labelled values; cross-check with text layer; second focused pass on crops (X2); `estimated` flag |
| Bounding boxes imprecise → bad crops | Pad crops 4%; Explorer review; manual override file for bad boxes |
| Footnote markers are superscripts lost in text | Detect via text-layer font size/baseline + vision pass; unresolved markers reported |
| Several product configurations in one report | `variant` metadata on rows/facts; query analysis extracts variant |
| Small document → tiny gold set | Add questions per content type; ground truth per element gives a second, larger eval |
| Images increase latency/cost | Only attach crops of top chart/table sources, max 3 |

## 9. Deliverables

1. App: Ask, Explorer, Inspect.
2. CLIs: render, extract, extract:eval, ingest, ask, eval.
3. `docs/EXTRACTION-RESULTS.md` — strategy comparison with numbers and examples.
4. `docs/EVAL-RESULTS.md` — QA ablation M0→M4(5), per-content-type findings.
