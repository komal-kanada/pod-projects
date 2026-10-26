# RAG Architecture

## Core idea

> The unit of the document is the **element**, not the paragraph. Extract each
> element type with a suitable technique, give each a **retrievable text
> form**, retrieve across types, then answer from the **whole element** — and,
> for visual elements, from the **image** too.

## End-to-end

```text
OFFLINE ───────────────────────────────────────────────────────────────────────────

 PDF
  ├─▶ render/pages.ts        page PNGs (150–200 DPI)
  ├─▶ render/text-layer.ts   words + bbox + font size  ─────────┐ ground truth for
  │                                                             │ characters/numbers,
  └─▶ extract (strategy X0 | X1 | X2 | X3)                      │ superscript markers
        page image ─▶ Gemini ─▶ elements[] {type, bbox, …}      │
        X2: crop chart/table ─▶ focused Gemini pass             │
        ↓ fidelity.ts  numbers vs text layer ◀──────────────────┘
        ↓ footnotes.ts markers ↔ footnote elements
        ↓ elements (cached) ──▶ extract:eval vs ground truth ──▶ EXTRACTION-RESULTS.md

  represent
        text     → section-aware chunks (+ attached footnotes)
        table    → markdown (for LLM) + row sentences (for retrieval) + summary line
        chart    → description + fact sentences (labelled values only)
        footnote → own chunk + appended to referencing chunks
        callout  → fact sentence
  ↓ normalize units/terms · contextual header · embed (768-d) · Postgres

ONLINE ────────────────────────────────────────────────────────────────────────────

 Question
  ↓ analyze     intent (numeric / explanation / comparison / methodology / …),
  │             target types, product variant, rewrite with glossary
  ↓ search      hybrid (vector ⊕ FTS with synonyms), type boosts, variant filter
  ↓ expand      row/fact/footnote hit → parent element (+ its footnotes)
  ↓ diversify   dedupe elements, keep type mix
  ↓ (rerank)    optional
  ↓ context     text blocks for every element + image crops for top chart/table elements
  ↓ generate    Gemini multimodal, cite [n] → element (type, page, title)
 Answer + rich source cards + trace
```

## Presets (ablation ladder)

| Preset | Extraction | Representations | Search | Generation |
| --- | --- | --- | --- | --- |
| **M0** baseline | X0 text layer | flat text chunks | vector top-6 | text |
| **M1** | X1 page elements → page markdown | flat chunks over markdown (tables as md) | vector | text |
| **M2** | best of X1/X2 | typed: text chunks, table rows, chart facts, footnotes linked, callouts | vector + element expansion | text |
| **M3** | ″ | ″ + units/glossary normalisation | hybrid + type boosts + variant filter + query analysis | text |
| **M4** | ″ | ″ | ″ | **multimodal** (crops attached) |
| **M5** (stretch) | ″ | ″ + crop/page image embeddings | ″ + visual retrieval fused | multimodal |

Default preset = winner of the ablation (expected M4).

## Why each piece exists

| Technique | Failure it addresses |
| --- | --- |
| Page images + vision extraction | Charts and table structure don't exist in the text layer |
| Bounding boxes | Crops for focused re-extraction, multimodal answering, and visual verification in Explorer |
| Focused second pass (X2) | Whole-page extraction misses small labels in dense charts/tables |
| Row sentences | A question about one cell can't match a whole-table embedding |
| Chart facts | Chart values become searchable text with their meaning attached |
| `labelled` vs `estimated` | Prevents stating eyeballed values as facts |
| Footnote linking | Claims and their conditions/methodology retrieved together |
| Units + glossary | "carbon footprint" vs "greenhouse gas emissions" vs "CO₂e"; "kg" vs "kilograms" |
| Element expansion | Row hit without headers is unreadable; the full table gives context |
| Multimodal generation | Lets the model verify extracted values and read layout the text missed |

## Answer contract

- Sources numbered `[n]`; each is an element with type, page, title.
- Figures with **unit and condition** (product configuration, life-cycle phase,
  assumption) and the footnote when one applies.
- Values marked `estimated` are given as approximate or not at all.
- Fixed refusal: "I couldn't find this in the iMac Environmental Report."
