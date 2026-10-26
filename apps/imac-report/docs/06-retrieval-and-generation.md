# Retrieval and Generation

## 1. Defaults (`lib/config.ts`)

| Setting | Value |
| --- | --- |
| `candidatePool` | 30 chunks |
| `finalElements` | 6 elements |
| `typeBoost` (numeric intent → table/chart/callout chunks) | +0.004 RRF score (~ +1–2 ranks) |
| `maxImages` (M4) | 3 crops |
| `contextTokenBudget` | 8000 text tokens |
| `rrfK` | 60 |

## 2. Query analysis (`analyze-query.ts`, M3+)

```ts
type QueryAnalysis = {
  intent: "numeric" | "explanation" | "comparison" | "methodology" | "yes_no" | "out_of_scope";
  targetTypes: ("text" | "table" | "chart" | "footnote" | "callout")[];   // hints, not filters
  variants: string[];          // validated against variant vocab
  phases: string[];            // life-cycle phases
  rewrittenQuery: string;      // glossary-aware, units canonical
  subQueries: string[];        // comparison: one per variant/phase
};
```

- `methodology` intent ("what assumptions…", "how is … calculated") → boosts
  `footnote` chunks — methodology lives in footnotes in this kind of report.
- Variants are **filters with fallback** (as in world-bank-report); target types are
  **boosts**, never filters.

## 3. Search (`search.ts`)

Per query/sub-query:

1. **Vector** over `embed_text` embeddings.
2. **Keyword** over `fts_tsv` (normalised units) with `websearch_to_tsquery`; query
   expanded with glossary synonyms (OR groups).
3. **RRF** fusion + type boost + variant filter/fallback.

M0–M2 use vector only; M3+ use the full hybrid.

## 4. Element expansion (`expand.ts`)

Ranked chunks → ranked **elements**:

| Hit chunk kind | Element in context |
| --- | --- |
| `table_row`, `table_summary` | Whole table (markdown), hit rows marked `→` |
| `chart_fact`, `chart_summary` | Whole chart as compact data table + description |
| `footnote` | The footnote **and** its top referencing element (title + first lines) |
| `text` | The text chunk; if < 300 chars, plus the next chunk in reading order |
| `callout` | The callout |

Always appended: every footnote linked to an included element (deduped), shown
under that element as `Notes:`.

Element score = max chunk score; elements ordered by score.

## 5. Diversify (`diversify.ts`)

- Dedupe by element.
- If the top `finalElements` are all one type and the analysis listed other target
  types, swap the lowest-scoring one for the best element of a missing target type
  (if its score is within 50 % of the cut-off).

## 6. Rerank (optional, M3+ experiment)

Listwise Gemini rerank over the top 15 elements (world-bank-report `rerank.ts`),
kept only if the ablation shows a gain — with ~300 chunks it may not be needed.

## 7. Context (`context.ts`)

Text part:

```text
<source id="2" type="chart" page="3" title="Life cycle carbon emissions" section="Climate Change">
Chart (stacked bar), unit: %
| Phase | iMac 24-inch (two ports) |
| Production | 70% (labelled) |
…
Description: …
Notes: [1] Use phase assumes …
</source>
```

Image parts (**M4+**): for up to `maxImages` top-ranked `chart`/`table` elements,
attach the crop PNG as `inlineData` right after a text line
`Image for source 2:`. The prompt tells the model the image is the original and
wins over extracted values if they disagree — and to say so.

Budget: text blocks added by score until 8k tokens; tables are all-or-nothing.
Final order: by score (small doc; few blocks).

## 8. Generation

- `gemini-3.6-flash`, multimodal input, temperature 0.2, streamed.
- Prompt: 09 §5 — cite `[n]`; units + conditions; footnote conditions stated when
  relevant; estimated values never exact; mention source type naturally ("the life
  cycle chart shows…").
- If the model reports an image/extraction disagreement, it is logged
  (`queries.disagreements`) — a free signal of extraction errors.

## 9. Visual retrieval (M5, stretch)

- Embed each element crop and each page image with a multimodal embedding model
  (e.g. Vertex `multimodalembedding`, Cohere Embed v4, or Voyage multimodal).
- Query embedded in the same space; top visual hits fused into RRF as a third list.
- Needs a second provider/key; implemented behind `VISUAL_EMBEDDINGS_PROVIDER` and
  skipped if unset.
