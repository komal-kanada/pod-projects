# Evaluation

The objective is to **improve retrieval accuracy and handling of large
documents**. "Improve" needs a baseline and attribution, so evaluation is an
**ablation over presets B0–B6** on one gold set.

## 1. Gold set — `eval/questions.json`

```json
{
  "version": 1,
  "questions": [
    {
      "id": "q01",
      "question": "<provided sample question, verbatim>",
      "source": "provided",
      "category": "numeric_table",
      "expected_answer": "<reference answer>",
      "must_include": ["<figure with unit>", "<year>"],
      "expected_pages": [89],
      "expected_sections": ["Regional Outlooks › South Asia"],
      "notes": ""
    }
  ]
}
```

`expected_sections` are **path prefixes** — a retrieved chunk under
`Regional Outlooks › South Asia › Outlook` matches `Regional Outlooks › South Asia`.

### Categories (long-document specific)

| Category | Tests | Example shape |
| --- | --- | --- |
| `fact` | Single passage lookup | "What does the report identify as …?" |
| `numeric_table` | Answer lives in a table | "What is the growth forecast for X in 2026?" |
| `comparison` | Two regions/countries/years | "How does growth in SAR compare with SSA?" |
| `cross_section` | Needs ≥ 2 sections/chapters | "How do the global risks in Ch.1 show up in LAC?" |
| `summary` | Chapter/report-level | "What are the main risks to the outlook?" |
| `figure_box` | Content in a figure or box | "What does Box 1.2 conclude?" |
| `disambiguation` | Similar sections | "Outlook" for one region, not another |
| `temporal` | Specific year vs others, forecast vs actual | "What was growth in 2024 (not forecast)?" |
| `out_of_scope` | Not in the report | Must refuse |

### Building it

1. Every **provided** sample question verbatim; fill answer, facts, pages, sections
   by hand from the PDF.
2. **Added** questions until each category has ≥ 3 (target total ~35–45), including
   ≥ 4 out-of-scope (e.g. a year/country the report doesn't cover).
3. Results always report `provided` and `added` separately — the provided set is the
   official validation, the added set gives statistical weight and coverage.

## 2. Metrics

### Retrieval (on the **final context**, not just raw candidates)

A context block "hits" if its pages overlap `expected_pages`; it is
"section-correct" if its section path starts with any `expected_sections`.

| Metric | Definition |
| --- | --- |
| Hit@k | ≥ 1 hit among top k ranked chunks (pre-context), k = 1, 5, 10 |
| Recall@k (pages) | Fraction of expected pages covered — matters for comparison/cross_section |
| MRR | 1 / rank of first hit |
| nDCG@10 | Graded: page hit = 2, section-only hit = 1 |
| Section accuracy@5 | ≥ 1 of top 5 is section-correct |
| Context hit | Final assembled context contains an expected page |
| Context precision | Tokens in section-correct blocks / total context tokens |

### Generation

| Metric | Definition |
| --- | --- |
| Correctness | Judge 0/1/2 → 0–1 |
| Faithfulness | All claims supported by context |
| Citation accuracy | A cited source overlaps expected pages |
| Refusal accuracy | Out-of-scope refused; in-scope wrong refusals counted |

### Cost and speed

| Metric | Definition |
| --- | --- |
| Context tokens | Mean / p95 |
| Total LLM tokens per question | analysis + rerank + generation |
| Latency | p50 / p95 total and first token |

## 3. Ablation run

```bash
npm run eval -- --presets B0,B1,B2,B3,B4,B5,B6 --no-judge   # retrieval only, fast
npm run eval -- --presets B0,B3,B5,B6                         # full with judge on contenders
```

Output: `eval/results/<timestamp>-ablation.{md,json}`:

```text
| Preset | Hit@5 | MRR | nDCG@10 | SecAcc@5 | CtxPrec | Correct | Faithful | Ctx tok | p95 ms |
| B0     | …     |     |         |          |         |         |          |         |        |
| B1     | …  (+Δ vs previous)                                                                 |
| …                                                                                          |

Per-category correctness (rows = category, cols = preset)
Wins/losses vs previous preset (question ids that flipped)
Failures for best preset with full trace excerpts
```

The **flip list** (questions that got better/worse between adjacent presets) is
the most useful output — it shows what each technique actually changed.

## 4. Additional experiments (after the ladder)

| Exp | Variable | Values |
| --- | --- | --- |
| E1 | Child size | 800 / 1600 / 2400 chars |
| E2 | `parentMaxTokens` | 1000 / 2000 / 4000 |
| E3 | `contextTokenBudget` | 6k / 12k / 24k |
| E4 | Contextual header | none / breadcrumb / breadcrumb + LLM context sentence |
| E5 | Table embedding | raw table / summary-line header |
| E6 | Rerank pool | 20 / 30 / 50 |
| E7 | Soft vs hard filters | soft / hard |

## 5. Manual review

After each full eval: review all failures and 10 random passes of the best
preset; mark judge agreement and **failure cause**:
`parse · tree · chunk · metadata · analysis · search · rerank · context · prompt · judge`.
Recorded in `docs/EVAL-RESULTS.md`.

## 6. Targets

See PRD §7. Headline: best preset Hit@5 ≥ 0.90 and ≥ +15 points over B0, with
better correctness at ≤ 1.5× B0's context tokens.
