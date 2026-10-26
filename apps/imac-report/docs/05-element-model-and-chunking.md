# Element Model and Retrievable Representations

## 1. Principle

> **Store** elements in the form that is faithful (JSON, markdown).
> **Retrieve** them through forms that embed and keyword-match well (sentences).
> **Answer** from the faithful form (and the image).

So each element produces one or more **derived chunks**. Every chunk carries
`element_id`; retrieval works on chunks, context works on elements.

## 2. Representations per type

| Element | Derived chunks (`chunk_kind`) | Sent to LLM |
| --- | --- | --- |
| text | `text` — section-aware chunks, ~1200 chars, sentence overlap; linked footnote texts appended under "Notes:" | chunk (+ neighbours if short) |
| table | `table_summary` — title + one-line description + column headers + row labels; `table_row` — one sentence per row | full table markdown + notes + footnotes |
| chart | `chart_summary` — title + description; `chart_fact` — one sentence per labelled point (or per series for many points) | chart JSON rendered as a compact table + description + footnotes (+ crop in M4) |
| footnote | `footnote` — marker + text + "Referenced by: <titles of referencing elements>" | footnote text + the referencing element title |
| callout | `callout` — figure + text + icon meaning | same |
| image | `image` — description (only if informative) | description |

### Row sentence template (`table-rows.ts`)

```text
Table "<title>" (page <p>): for <row header(s)>, <col 1> is <value><unit>;
<col 2> is <value><unit>; … [Notes: <footnote ids>]
```

Example (illustrative):

```text
Table "Energy consumption" (page 4): for iMac 24-inch (four ports), Off mode is
0.xx W; Sleep mode is 0.xx W; Idle (display on) is xx W.
```

Wide tables (> 8 columns): one sentence per (row, column-group).

### Chart fact template (`chart-facts.ts`)

```text
Chart "<title>" (page <p>, <chartType>): <series> — <label>: <valueText><unit>
(labelled on chart). [Notes: …]
```

Estimated points generate **no** fact sentence; they appear in the chart summary
as "approximate visual values not labelled".

## 3. Contextual header

Prepended to every chunk's `embed_text`:

```text
Apple iMac Environmental Report | Page 3 | Section: Climate Change |
Type: chart | Variant: iMac 24-inch (two ports)
```

## 4. Metadata

| Field | Source |
| --- | --- |
| `element_id`, `element_type`, `chunk_kind` | Element |
| `page`, `bbox` | Element |
| `section` | Latest heading |
| `variants text[]` | Product configuration names found in the element (vocab built from the report's own table row headers) |
| `phases text[]` | Life-cycle phases mentioned (production, transport, use, end-of-life) |
| `units text[]` | Canonical units present |
| `has_numbers bool` | Any numeric token |
| `footnote_markers text[]` | Linked footnotes |
| `value_source` | For chart facts: always `labelled` |
| `extraction_strategy` | X0…X3 |

## 5. Normalisation (`lib/normalize/`)

### Units (`units.ts`)

| Variants | Canonical (for FTS) |
| --- | --- |
| CO₂e, CO2e, CO2-e, carbon dioxide equivalent | `co2e` |
| kg, kilogram(s) | `kg` |
| g, gram(s) | `g` |
| kWh, kilowatt-hour(s) | `kwh` |
| W, watt(s) | `w` |
| %, percent, per cent | `percent` |

Applied to `fts_text` (a normalised copy used for `tsvector`), **not** to displayed
content.

### Glossary (`glossary.ts`)

Small hand-made synonym groups used for (1) keyword query expansion and (2) query
rewrite hints, e.g.:

```text
carbon footprint ~ life cycle carbon emissions ~ greenhouse gas emissions ~ co2e
recycled content ~ recycled material ~ secondary material
packaging ~ fiber-based packaging ~ plastic packaging
energy efficiency ~ power consumption ~ energy consumption
end of life ~ recycling ~ disposal
```

The glossary is built in Phase 3 from the report's own vocabulary + sample
questions, and kept small — every entry is a deliberate choice.

## 6. Expected scale

Apple product environmental reports are typically short (estimate ~10–25 pages):
roughly 100–300 elements, 300–900 derived chunks. Exact search is fine; no ANN
index needed.
