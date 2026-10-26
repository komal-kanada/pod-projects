# Evaluation

Two evaluations, because there are two different questions:

1. **Extraction eval** — did we turn the page into correct data? (strategies X0–X3)
2. **QA eval** — does the whole system answer correctly? (presets M0–M5)

A QA failure is only diagnosable if extraction is measured separately.

## 1. Extraction evaluation

### Ground truth — `eval/ground-truth/`

Hand-labelled from the PDF in Phase 1. Labelling *all* of a short report is
feasible; if not, at least:

| File | Content | Minimum |
| --- | --- | --- |
| `tables.json` | `{page, title, columns, rows}` exactly as printed | every table |
| `charts.json` | `{page, title, chartType, points: [{series, label, valueText}]}` labelled values only | every chart |
| `footnotes.json` | `{marker, text, referencedBy: [{page, snippet}]}` | every footnote |
| `coverage.json` | `{page, facts: ["<short fact string>", …]}` — 3–5 important facts per page incl. callouts | every page |

### Metrics

| Metric | Definition |
| --- | --- |
| Table detection | Tables found (title/position match) / GT tables |
| Table cell accuracy | Exact-match cells (normalised whitespace) / GT cells, over matched tables |
| Table structure | Same row × column count |
| Chart detection | Charts found / GT charts |
| Chart value accuracy | Labelled points with exact `valueText` and correct label / GT points |
| Chart false-labelled | Points marked `labelled` that are not printed (should be 0) |
| Footnote text accuracy | Footnotes found with matching text |
| Footnote link accuracy | Correct (element → footnote) links / GT links |
| Fact coverage | `coverage.json` facts present anywhere in the page's extracted content |
| Cost / time | Tokens and seconds per page |

### Output

`npm run extract:eval -- --strategies X0,X1,X2` →
`eval/results/extraction-<timestamp>.md`:

```text
| Strategy | Tbl det | Cell acc | Chart det | Chart val | False-lbl | Fn link | Coverage | s/page |
| X0       |         |          |           |           |           |         |          |        |
| X1       |         |          |           |           |           |         |          |        |
| X2       |         |          |           |           |           |         |          |        |
+ per-element diffs for every error (GT vs extracted)
```

Summarised with examples and the final choice in `docs/EXTRACTION-RESULTS.md`.

## 2. QA evaluation

### 2.1 Gold set — `eval/questions.json`

```json
{
  "id": "q01",
  "question": "<provided sample question, verbatim>",
  "source": "provided",
  "answer_location": ["chart", "footnote"],
  "category": "cross_type",
  "expected_answer": "<reference answer>",
  "must_include": ["<value with unit>", "<condition>"],
  "expected_values": [{"value": "<number>", "unit": "%"}],
  "expected_elements": [{"page": 3, "type": "chart", "title": "<title>"},
                        {"page": 3, "type": "footnote", "marker": "1"}],
  "notes": ""
}
```

`expected_elements` match extracted elements by page + type + (title fuzzy match or
marker). For M0 (no elements), a chunk on the right page counts.

### Categories (by where the answer lives)

| Category | Answer in |
| --- | --- |
| `text` | Paragraph |
| `table` | Table cell(s) |
| `chart` | Chart value(s) |
| `footnote` | Footnote (methodology, assumptions, scope) |
| `callout` | Badge / key figure |
| `cross_type` | Two types (e.g. chart + footnote, table + text) |
| `comparison` | Two variants/phases |
| `out_of_scope` | Not in the report — must refuse (incl. other Apple products, other years) |

Build: all provided questions verbatim + added questions until each category has
≥ 3 (target ~30 total).

### 2.2 Metrics

| Metric | Definition |
| --- | --- |
| Element Hit@k | Any expected element in top k elements (k = 1, 3, 6) |
| Element Recall@6 | Fraction of expected elements retrieved (key for `cross_type`) |
| MRR | First expected element |
| Numeric exact match | All `expected_values` present in the answer (value + canonical unit) |
| Correctness | Judge 0/1/2 → 0–1 |
| Faithfulness | Judge (with images) |
| Footnote condition rate | For questions whose expected elements include a footnote: answer states the condition |
| Estimated-as-exact | Answers stating an `estimated` value without hedging (should be 0) |
| Refusal accuracy | Out-of-scope refused; in-scope wrongly refused |
| Latency, tokens, images | p50/p95; mean images sent |

All reported overall, **per category**, and provided vs added.

### 2.3 Ablation

```bash
npm run eval -- --presets M0,M1,M2,M3,M4 --no-judge   # retrieval metrics only
npm run eval -- --presets M0,M2,M3,M4                 # full
```

Report: preset × metric table, **category × preset** correctness table (the key
view — table/chart/footnote rows should show the gains), and the flip list
(questions that changed between adjacent presets).

### 2.4 Experiments

| Exp | Variable | Values |
| --- | --- | --- |
| E1 | Row sentences vs whole-table embedding only | |
| E2 | Chart facts vs chart description only | |
| E3 | Footnote attachment on/off | |
| E4 | Glossary expansion on/off | |
| E5 | Images: none / top-1 / top-3 | |
| E6 | Render DPI for extraction: 120 / 170 / 300 | (extraction eval) |
| E7 | Rerank on/off | |

## 3. Targets

See PRD §7. Headline: on table/chart/footnote questions, best preset beats M0 by
≥ 25 points element Hit@5, with numeric exact match ≥ 0.85 and zero
estimated-as-exact answers.

## 4. Manual review

All failures + 10 random passes per full run. Failure cause tags:
`render · detect · extract · fidelity · footnote-link · represent · search · expand · context · prompt · judge`.
