# RAG Architecture

## Core idea

> Make the document's **structure** a first-class part of the index, retrieve
> **small** precise units, answer from **big** coherent context, and spend the
> context budget only on what's relevant.

## End-to-end

```text
OFFLINE ─────────────────────────────────────────────────────────────────────────────

 PDF (~200 pp)
   ├─▶ text-layer.ts   unpdf text per page ───────────────┐ ground truth for numbers
   ├─▶ outline.ts      bookmarks + page labels ──────────┐│
   └─▶ page-markdown.ts Gemini: page → markdown          ││
          ↓ fidelity.ts  numbers & coverage vs text layer ◀┘
          ↓ blocks.ts    heading | para | table | figure | box | footnote
          ↓ tree.ts      Report › Chapter › Section › Subsection  ◀── outline
          ↓ summaries.ts section + chapter summaries (bottom-up)
          ↓ chunking     child chunks · table/figure/box chunks · summary nodes
          ↓ metadata     regions · countries · years · is_forecast · content_type
          ↓ embeddings   contextual header + text → 768-d
          ↓ Postgres     sections · chunks (vector + tsvector + metadata)

ONLINE (per question, preset B6 shown) ──────────────────────────────────────────────

 Question
   ↓ 1 analyze-query   intent · filters · rewrite · sub-queries          (Gemini JSON)
   ↓ 2 summary-route   broad intent → top sections via summary nodes
   ↓ 3 search          per (sub-)query: hybrid (vector ⊕ FTS, RRF) + metadata filters,
   │                    restricted to routed sections if any; relax filters if too few
   ↓ 4 rerank          top 30 → Gemini listwise scores → top 8
   ↓ 5 context         child → parent (small-to-big), merge neighbours, dedupe,
   │                    keep tables whole, document order, token budget ~12k
   ↓ 6 generate        Gemini, cite [n] → section + page
   ↓ 7 log             query + full trace + tokens + latency
 Answer + sources grouped by section + trace
```

## Pipeline presets (the ablation ladder)

Each preset adds **one** capability to the previous one, so the eval can
attribute gains. Presets are defined in `lib/config.ts`.

| Preset | Parsing | Chunking | Search | Query analysis | Rerank | Context | Summaries |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **B0** baseline | text layer | flat 800 tok, 12 % overlap | vector top-6 | — | — | chunks as-is | — |
| **B1** +structured parse | Gemini markdown | flat 800 tok | vector top-6 | — | — | as-is | — |
| **B2** +hierarchical | Gemini markdown | children ~400 tok in sections + atomic blocks + contextual header | vector top-8 | — | — | small-to-big, budget | — |
| **B3** +hybrid | ″ | ″ | hybrid RRF | — | — | ″ | — |
| **B4** +query analysis | ″ | ″ | hybrid + filters + sub-queries | ✓ | — | ″ | — |
| **B5** +rerank | ″ | ″ | hybrid pool 30 | ✓ | ✓ top-8 | ″ | — |
| **B6** +summaries | ″ | ″ + summary nodes | ″ + summary routing | ✓ | ✓ | ″ | ✓ |

B0 and B1 use a flat ingestion run; B2–B6 share a hierarchical run (B6's
summary nodes are in the same run but ignored by B2–B5).

If a step doesn't help, it is dropped from the final recommended preset —
that's a valid result.

## Where each doc goes deeper

| Topic | Doc |
| --- | --- |
| Parsing, fidelity, blocks, tree | 04-document-processing.md |
| Chunk types, sizes, header, summaries, metadata | 05-chunking-and-metadata.md |
| Query analysis, search, filters, rerank, context | 06-retrieval-and-context.md |
| Prompts | 09-prompts.md |
| Measuring all of it | 10-evaluation.md |

## Answer contract

- Sources are numbered `[1]…[n]` in the order they appear in the assembled context.
- Every factual sentence cites at least one `[n]`.
- Each citation maps to: section breadcrumb, page label(s), content type
  (e.g. *Table 1.1*).
- Figures are quoted exactly with unit, region and year; forecasts are labelled
  as forecasts (`f`/`e` markers in World Bank tables).
- Fixed refusal sentence when the context does not contain the answer.
- Summary nodes are **never** sent as citable context — they only route to
  real sections.

## Trace contract

`TraceStage = { stage, ms, input summary, output summary, details }`, e.g.:

```json
[
  {"stage":"analyze","ms":610,"output":{"intent":"comparison","filters":{"regions":["SAR","SSA"],"years":[2025]},"subQueries":["South Asia growth 2025","Sub-Saharan Africa growth 2025"]}},
  {"stage":"search","ms":140,"output":{"perQuery":[{"q":"…","candidates":30,"filtersRelaxed":false}]}},
  {"stage":"rerank","ms":1900,"output":{"kept":8,"dropped":22}},
  {"stage":"context","ms":12,"output":{"parents":4,"merged":2,"tokens":9120,"budget":12000,"droppedForBudget":1}}
]
```
