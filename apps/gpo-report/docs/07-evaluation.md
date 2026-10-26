# Evaluation

The objective says "validate the implementation using the sample questions".
This doc turns that into a repeatable, scored harness.

## 1. Gold set — `eval/questions.json`

```json
{
  "version": 1,
  "document": "gpo-annual-report.pdf",
  "questions": [
    {
      "id": "q01",
      "question": "<sample question, verbatim>",
      "source": "provided",
      "category": "factual",
      "expected_answer": "<short reference answer written from the report>",
      "must_include": ["<key fact>", "<figure with unit>"],
      "expected_pages": [14, 15],
      "notes": ""
    },
    {
      "id": "oos01",
      "question": "What is the population of Canada?",
      "source": "added",
      "category": "out_of_scope",
      "expected_answer": null,
      "must_include": [],
      "expected_pages": [],
      "notes": "Must refuse"
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `source` | `provided` (from the sample list, verbatim) or `added` (ours) — reported separately |
| `category` | `factual` · `numeric` · `summary` · `multi_hop` · `out_of_scope` |
| `expected_pages` | **PDF page indices** (1-based) where the answer is. Any one is enough for Hit@k |
| `must_include` | Facts the judge checks for; keep each short and checkable |

### Building it (Phase 0 / Phase 5)

1. Copy every provided sample question **verbatim** — never edit them.
2. For each, find the answer in the PDF by hand; write `expected_answer`,
   `must_include`, `expected_pages`. This is the slowest and most valuable step.
3. Add our own questions so the metrics mean something:
   - one **paraphrase** for each of ~5 sample questions (different vocabulary),
   - **3–5 out-of-scope** questions (plausible but not in the report, e.g. a
     fiscal year the report does not cover),
   - **2–3 multi-hop** questions (answer needs two sections),
   - **2–3 numeric** questions whose answer is in a table.

Target: provided questions + ~15 added.

## 2. Metrics

Computed per question, aggregated overall **and per category**, and separately for
`provided` vs `added`.

### Retrieval (no LLM needed — run these first, they are cheap)

A retrieved chunk "hits" if `[page_start, page_end]` overlaps `expected_pages`.

| Metric | Definition |
| --- | --- |
| Hit@k | 1 if any of the top k chunks hits, else 0 |
| Recall@k | fraction of `expected_pages` covered by the top k chunks |
| MRR | 1 / rank of the first hit (0 if none) |

Reported at k = 1, 3, 6. Out-of-scope questions are excluded.

### Generation

| Metric | Definition |
| --- | --- |
| Correctness | Judge score 0/1/2 → mean scaled to 0–1 (in-scope only) |
| Faithfulness | Share of in-scope, non-refusal answers the judge marks fully supported |
| Citation accuracy | Share of answers where at least one cited chunk hits `expected_pages` |
| Invalid citations | Count of `[n]` outside 1..k (should be 0) |
| Refusal accuracy | Out-of-scope: refused / total. In-scope: wrongly refused / total (reported as a failure) |
| Latency | p50 / p95 total and first-token, ms |

### Manual review (required)

After each eval, review **all** failures and **10 random passes** and mark
"judge agrees: yes/no" in the results file. If agreement drops below ~90 %, fix the
judge prompt before trusting the numbers.

## 3. Output — `eval/results/<YYYYMMDD-HHmm>-<runShortId>-<mode>.{md,json}`

Markdown report header:

```text
# Eval — 2026-10-20 14:05
Ingestion run: 3f2a… (chunk 3200 / overlap 400, gemini-embedding-001 768-d)
Retrieval: vector, k=6 · Generator: gemini-3.6-flash · Prompt: v1 · Commit: abc123

| Metric | All | provided | added |
| Hit@6 | 0.88 | … | … |
...

## Per-category
...

## Failures
### q07 (numeric) — Hit@6 ✗, correctness 0
Question: …
Expected pages: 22 · Retrieved pages: 4, 9, 23, …
Answer: …
Judge: …
```

The JSON file holds every per-question record for diffing runs.

## 4. Targets (initial — revisit after the first run)

| Metric | Target |
| --- | --- |
| Hit@6 | ≥ 0.85 |
| MRR | ≥ 0.65 |
| Correctness | ≥ 0.75 |
| Faithfulness | ≥ 0.90 |
| Out-of-scope refusal | 1.00 |
| In-scope wrong refusals | 0 |
| Citation accuracy | ≥ 0.80 |
| p95 latency | < 8 s |

## 5. Experiment matrix (Phase 6)

Change **one variable at a time** against the baseline. Retrieval metrics first
(`--no-judge`, cheap); run the full judge only for promising configs.

| Exp | Variable | Values |
| --- | --- | --- |
| E0 | Baseline | chunk 3200 / overlap 400 / vector / k=6 / header on |
| E1 | Chunk size | 1600 / 3200 / 6400 |
| E2 | Overlap | 0 / 400 / 800 |
| E3 | Contextual header | on / off |
| E4 | Retrieval mode | vector / hybrid |
| E5 | top-k | 4 / 6 / 8 |
| E6 | Table pages via Gemini re-extraction | off / on |

Each experiment gets a row in `docs/EVAL-RESULTS.md`:

| Exp | Run | Hit@6 | MRR | Correct | Faithful | Kept? | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |

## 6. Ad-hoc checks during development

- `/inspect` — type a question, look at ranks and scores.
- `npm run ask -- "…"` — terminal answer with sources.
- `npm run eval -- --no-judge` — retrieval-only metrics in seconds.
