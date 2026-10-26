# Parsing and Extraction

This is the heart of the project. The brief says *explore* appropriate
techniques, so several strategies are implemented behind one interface and
**scored**, and the choice is made from evidence.

## 1. Rendering (`lib/render/`)

| Output | Tool | Notes |
| --- | --- | --- |
| Page PNG | `mupdf` (WASM) | 170 DPI default (readable chart labels, ~1.5k px wide). Store width/height |
| Text layer | `mupdf` structured text (or `unpdf`) | Words with bbox, font name, **font size**, baseline — superscripts detected as words with smaller size and raised baseline |
| Crops | `sharp` | bbox (normalised 0–1000) → pixels, 4 % padding |

Cached in `data/cache/pages/` and `data/cache/text-layer/`.

## 2. Element types

```ts
type ElementBase = { id: string; page: number; bbox: [ymin, xmin, ymax, xmax]; // 0–1000
                     order: number; section?: string; footnoteRefs: string[] };

type Element = ElementBase & (
  | { type: "heading"; level: number; text: string }
  | { type: "text"; text: string }
  | { type: "table"; title?: string; columns: string[]; rows: string[][];
      rowHeaderCols: number; unit?: string; notes?: string; markdown: string }
  | { type: "chart"; chartType: "bar" | "stacked_bar" | "pie" | "donut" | "line" | "other";
      title?: string; unit?: string; xLabel?: string; yLabel?: string;
      series: { name: string; points: { label: string; value: number | null;
                                         valueText: string; valueSource: "labelled" | "estimated" }[] }[];
      description: string }
  | { type: "footnote"; marker: string; text: string }
  | { type: "callout"; text: string; figure?: string; iconMeaning?: string }
  | { type: "image"; description: string }   // photos/diagrams with no data
);
```

## 3. Strategies

### X0 — text layer only (baseline)

- Words → lines → paragraphs by position; repeated headers/footers removed.
- Footnotes: lines at page bottom starting with a marker in smaller font.
- Markers: superscript words in body text.
- Tables/charts: whatever text exists, no structure. Charts typically yield only
  titles and scattered labels.

### X1 — Gemini page → elements

- Input: page PNG (+ the page's text-layer text as a **hint**, so the model can copy
  exact characters).
- Output: JSON `Element[]` with `box_2d` (Gemini's native `[ymin, xmin, ymax, xmax]`
  0–1000 format) via `responseSchema`. Prompt in 09 §1.
- Rules: verbatim text; tables with every cell; charts with series/points,
  `valueSource` = `labelled` only if the number is printed on the chart; footnote
  markers kept on the element that uses them.

### X2 — X1 + focused pass

For every `table` and `chart` from X1:
1. Crop at higher resolution (re-render the bbox at 300 DPI).
2. Focused prompt (09 §2 / §3) that extracts only that element in detail.
3. Replace the X1 element's content with the focused result if it parses and passes
   fidelity; otherwise keep X1 and log.

Rationale: dense charts with small labels and wide tables are where whole-page
extraction loses detail.

### X3 — optional comparison

One of:
- Same as X2 with the **Pro** model for extraction only.
- An external parser through an adapter that maps its output to `Element[]`
  (LlamaParse, Docling via a Python sidecar, or Azure Document Intelligence).

Only if time and keys allow; the comparison is still valid with X0–X2.

## 4. Post-processing

### Fidelity (`fidelity.ts`)

- Every numeric token in text/table/callout elements must appear in the page text
  layer (normalised: thousands separators, `−`/`-`, `CO₂`/`CO2`, `%`).
- Chart `labelled` values must appear in the text layer **if** the chart's labels are
  real text (many vector charts keep labels as text). If labels are not in the text
  layer (rasterised chart), the check is skipped and the element is marked
  `fidelityChecked: false`.
- Failures → element flagged; X2 retries the focused pass once; remaining flags are
  listed for manual review in Explorer.

### Tables (`tables.ts`)

- Normalise: trim, unify dashes/blank cells (`—`, `–`, `n/a` → `null` + original text
  kept), detect unit from title/header ("(kWh)", "%", "kg CO₂e").
- Multi-page tables: same column headers on consecutive pages → merge.
- Row headers: first `rowHeaderCols` columns are the row's identity (e.g. product
  configuration, mode).

### Charts (`charts.ts`)

- Pie/donut/stacked bar percentages: check that labelled shares sum to ~100 %
  (± 2); otherwise flag.
- `valueText` keeps the printed form ("70%", "<1%").
- `value` parsed number or `null` for "<1%" style (kept as text).

### Footnotes (`footnotes.ts`)

1. Collect footnote elements (bottom-of-page or end-of-document notes) → map
   `marker → footnote`.
2. Collect markers on elements: from X1/X2 `footnoteRefs` **and** from text-layer
   superscripts located inside the element's bbox (union).
3. Resolve: same-page footnotes first, then document-level notes section.
4. Output `footnote_links (element_id, footnote_element_id, marker)`; unresolved
   markers listed in the extraction report.

### Callouts (`callouts.ts`)

Badges/infographic blocks become `callout` elements with the figure, the text,
and (if an icon carries meaning, e.g. a recycling icon) `iconMeaning`.

## 5. Reading order and sections

Elements are ordered top-to-bottom, left-to-right within columns (X1 returns
order; X0 uses positions). The latest `heading` element gives each element its
`section`.

## 6. Manual overrides

`data/overrides.json` can fix a specific element (bbox, a cell, a chart value)
by element id. Overrides are applied after extraction, recorded in the run
config, and **reported** — the extraction scores are always computed *without*
overrides so the comparison stays honest.

## 7. Choosing the strategy

`npm run extract:eval` (10 §1) scores X0–X2(X3) on the ground truth. The
winner becomes the ingestion source for M2–M5. The comparison, with examples
of what each strategy got wrong, is written to `docs/EXTRACTION-RESULTS.md`.
