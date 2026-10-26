# Retrieval and Context Management

Stages run by `lib/retrieval/pipeline.ts`. Which stages run is set by the
preset (03 §Presets). Every stage returns a trace entry.

## 1. Defaults (`lib/config.ts`)

| Setting | Value |
| --- | --- |
| `candidatePool` (per query, before rerank) | 30 |
| `finalK` (after rerank / without rerank) | 8 |
| `rrfK` | 60 |
| `minFilteredResults` | 5 |
| `maxSubQueries` | 3 |
| `summaryRouteTopSections` | 4 |
| `parentMaxTokens` | 2000 |
| `contextTokenBudget` | 12000 |
| `rerankMinScore` | 3 (of 10) |

## 2. Query analysis (`analyze-query.ts`, B4+)

One Gemini call, JSON schema output (09 §3):

```ts
type QueryAnalysis = {
  intent: "fact" | "numeric" | "comparison" | "summary" | "explanation" | "out_of_scope";
  rewrittenQuery: string;           // self-contained, report vocabulary, acronyms expanded
  subQueries: string[];             // only for comparison / multi-part, ≤ 3
  filters: {
    regions?: string[];             // World Bank region codes
    countries?: string[];           // ISO3
    years?: number[];
    contentTypes?: ("table" | "figure" | "box" | "text")[];
    chapter?: string;
  };
  wantsForecast?: boolean;
};
```

Guards:
- Filters are **validated** against `metadata/vocab.ts` and the actual chapter
  titles; unknown values are dropped (and logged in the trace).
- Invalid JSON or an error → fallback `{ intent: "fact", rewrittenQuery: question }`.
- `out_of_scope` is **not** used to refuse early — retrieval still runs; it only
  feeds the trace. (Refusal is decided by the answer model from evidence.)

## 3. Summary routing (`summary-route.ts`, B6)

If `intent ∈ {summary, explanation}`:
1. Vector search over `content_type = 'summary'` → top 4 sections.
2. Subsequent search is restricted to chunks under those sections (`section_path`
   prefix) **plus** an unrestricted search; results are fused (RRF), so a bad route
   can't hide the right answer.

## 4. Search (`search.ts`)

For each query in `[rewrittenQuery, ...subQueries]` (or the raw question pre-B4):

```text
vector  : top candidatePool by cosine,       WHERE run_id, content_type ≠ summary, filters
keyword : top candidatePool by ts_rank_cd,   websearch_to_tsquery('english', q), same WHERE
fuse    : RRF  Σ 1/(rrfK + rank)
```

Filters are applied in SQL (`hybrid_search` in 08 §Functions):
- `regions && $regions` (array overlap), `countries && $countries`, `years && $years`,
  `content_type = any($types)`, `chapter = $chapter`.
- **Soft filtering:** if a filtered search returns < `minFilteredResults`, drop the
  least reliable filter first (`contentTypes` → `years` → `countries` → `regions` →
  `chapter`) and retry. The trace records each relaxation.
- Chunks with *empty* `regions` are **not** excluded by a region filter when they
  sit under a global section (global statements often apply to all regions) —
  implemented as `(regions && $r OR regions = '{}')` with a small rank penalty.

Sub-query results are merged with RRF, with **per-sub-query quotas** (at least
`finalK / n` slots each) so a comparison always gets evidence for both sides.

## 5. Rerank (`rerank.ts`, B5+)

- Input: up to 30 candidates (deduped by chunk id), each shown as breadcrumb +
  first ~600 chars (tables: caption + header + first rows).
- One Gemini **listwise** call: score each 0–10 for "contains information needed
  to answer the question" (09 §4). JSON output `[{id, score}]`.
- Keep candidates with score ≥ `rerankMinScore`, top `finalK`, preserving quotas
  for sub-queries.
- On failure → fall back to fused order (trace notes it).

Alternative (documented, not default): a dedicated reranker API (Cohere / Voyage
rerank) — would need another key; can be compared later as an experiment.

## 6. Context assembly (`context.ts`, B2+)

Input: final ranked chunks. Output: numbered context blocks within the budget.

1. **Expand (small-to-big)**
   - `child` → its parent leaf section if `section.token_count ≤ parentMaxTokens`;
     otherwise a **window**: the child + previous/next children in the same section,
     growing alternately until ~`parentMaxTokens`.
   - `table` / `figure` → as is (plus the section's first paragraph if it introduces
     the table — optional).
   - `box` child → whole box if it fits, else window.
2. **Merge** — overlapping/adjacent windows in the same section become one block;
   two children with the same parent produce one parent block.
3. **Dedupe** — a table already contained in an included parent is not repeated.
4. **Score** each block = best rerank (or fusion) score among its member chunks.
5. **Budget** — add blocks by score until `contextTokenBudget`; a block that doesn't
   fit is shrunk back to its window (or the bare child); tables are all-or-nothing.
   Dropped blocks are recorded in the trace.
6. **Order** — group by chapter, then **document order** within the context (reads
   like the report; avoids "lost in the middle" from random ordering). Highest-scoring
   block's chapter first.
7. **Format** — each block gets a number and header:

```text
<source id="3" section="Regional Outlooks › South Asia › Outlook" pages="87–88" type="text">
…
</source>
<source id="4" section="Regional Outlooks › South Asia" pages="89" type="table" title="Table 2.5.1 South Asia country forecasts">
| … |
</source>
```

Citations `[n]` map back to block → section → pages; a block's member chunk ids
are kept for retrieval metrics.

## 7. Generation

- `gemini-3.6-flash`, temperature 0.2, streaming, prompt in 09 §5.
- Comparison intent: the prompt asks for a side-by-side structure (short table or
  parallel bullets).
- Numeric intent: exact figure, unit, year, forecast marker, then source.

## 8. Cost/latency budget per question (B6)

| Stage | Calls | Typical ms |
| --- | --- | --- |
| Query analysis | 1 Gemini (small) | 500–900 |
| Embeddings | 1–4 | 100–300 |
| Search (SQL) | 2–8 RPCs | 50–200 |
| Rerank | 1 Gemini (~8k in) | 1500–2500 |
| Generation | 1 Gemini (~12k in), streamed | first token 800–1500 |

Analysis and embedding of the raw question run **in parallel**; once analysis
returns, extra embeddings for rewrites/sub-queries are batched in one call.
