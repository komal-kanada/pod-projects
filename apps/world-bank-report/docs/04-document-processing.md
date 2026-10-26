# Document Processing

Goal: turn the PDF into an accurate, **typed, hierarchical** representation.
Everything downstream depends on this; a parsing error can't be fixed by
better retrieval.

## 1. Three sources, one truth

| Source | Good at | Bad at |
| --- | --- | --- |
| **Text layer** (`unpdf`) | Exact characters and numbers | Tables flattened, columns sometimes interleaved, no structure |
| **PDF outline** (bookmarks) | Authoritative chapter/section titles + start pages | Often only 2–3 levels deep; may be missing |
| **Gemini page reading** (multimodal) | Layout: headings, tables as tables, boxes, figure descriptions, reading order | Can mistype or invent numbers |

Strategy: **Gemini for structure, text layer for verification, outline for the
skeleton.**

## 2. Text layer + outline (`text-layer.ts`, `outline.ts`)

- `unpdf` → per-page text cached at `data/cache/text-layer/page-NNN.txt`.
- `pdf.getOutline()` → `{ title, pageNumber, level, children }` tree.
- `pdf.getPageLabels()` → printed page labels (front matter in roman numerals).

## 3. Page → markdown with Gemini (`page-markdown.ts`)

- Send the PDF to Gemini in **batches of ~5 pages** (via the Files API, or split
  into small PDFs with `pdf-lib`). Ask for one markdown document per page,
  delimited by `<<<PAGE n>>>` markers.
- Prompt (09 §1) asks for:
  - `#`/`##`/`###` headings matching visual hierarchy,
  - tables as GitHub markdown tables, header rows preserved, units and
    footnote markers (`e`, `f`) kept,
  - `<figure title="…">` with a 2–4 sentence factual description of the chart
    (axes, series, notable values as labelled — never estimated),
  - `<box title="…">…</box>` for boxed text,
  - `<footnote n="…">` for footnotes,
  - running headers/footers and page numbers omitted,
  - text copied verbatim — no paraphrase.
- Cache key: `sha256(page bytes) + PARSE_PROMPT_VERSION + model` →
  `data/cache/markdown/page-NNN.md`. Re-runs skip cached pages; `--pages 40-45`
  re-parses selected pages.
- Concurrency: 3 batches in flight, backoff on 429.

Approximate cost: ~200 pages × (image input + ~1k tokens out) on Flash — small,
and paid once.

## 4. Fidelity check (`fidelity.ts`)

For each page compare Gemini markdown with the text layer:

1. **Numeric check** — extract every number token (`3.1`, `-0.4`, `2,350`, `2025`)
   from the markdown (excluding figure descriptions). Each must appear in the
   page's text layer (after normalising `,` and `−`). `numericPrecision =
   matched / total`.
2. **Coverage** — word-level recall of text-layer tokens in the markdown
   (catches dropped paragraphs).

| Result | Action |
| --- | --- |
| precision ≥ 0.98 and coverage ≥ 0.90 | ✅ accept |
| below either | ⚠️ re-parse that page once (single-page call) |
| still below | ❌ use text layer for that page; mark `parse_source = 'text_layer'` |

`data/cache/fidelity.json` + a printed summary. **Pages flagged here are checked
by hand in Phase 1.**

## 5. Blocks (`blocks.ts`)

Markdown is parsed (`remark`/`mdast`) into typed blocks:

```ts
type Block =
  | { kind: "heading"; level: 1|2|3|4; text: string; page: number }
  | { kind: "paragraph"; text: string; page: number }
  | { kind: "list"; items: string[]; page: number }
  | { kind: "table"; caption?: string; markdown: string; rows: number; page: number; notes?: string }
  | { kind: "figure"; title: string; description: string; page: number; source?: string }
  | { kind: "box"; title: string; markdown: string; page: number }
  | { kind: "footnote"; n: string; text: string; page: number };
```

Cross-page joins:
- A paragraph ending without terminal punctuation followed by a paragraph on the
  next page → merged (continued paragraph).
- A table on page N+1 whose header matches the table ending page N → merged
  (continued table).
- A box spanning pages → merged by title.

Footnotes are attached to the block that contains their marker (`text¹` or `[1]`);
kept as `block.footnotes[]` and appended to that block's chunk.

## 6. Section tree (`structure/tree.ts`)

```text
Report
 ├─ Front matter (Foreword, Acknowledgments, Abbreviations, Executive Summary)
 ├─ Chapter 1  Global Outlook
 │   ├─ 1.1 Summary
 │   ├─ 1.2 Global context
 │   │   └─ Box 1.1 …
 │   ├─ 1.3 Major economies
 │   └─ 1.4 Risks to the outlook
 ├─ Chapter 2  Regional Outlooks
 │   ├─ East Asia and Pacific
 │   │   ├─ Recent developments
 │   │   ├─ Outlook
 │   │   └─ Risks
 │   └─ …
 ├─ Statistical Appendix
 └─ References
```

Algorithm:
1. Skeleton from the **outline** (if present) — authoritative titles + start pages.
2. Walk blocks in order; a `heading` block opens a node at its level. Headings
   that fuzzy-match an outline entry (normalised title, same or adjacent page)
   snap to it; extra markdown headings deeper than the outline become children.
3. Non-heading blocks attach to the current deepest node.
4. Each node gets `pageStart`, `pageEnd`, `tokenCount` (sum of descendants),
   `path` (`["Regional Outlooks","East Asia and Pacific","Outlook"]`),
   `kind` (`front_matter | chapter | section | appendix | references`).
5. **Region inference**: if a section path contains a World Bank region name, that
   region is inherited by every block below it (see 05 §4).

Excluded from retrieval by default (configurable): table of contents,
abbreviations list, references/bibliography. They are still in the tree.

`npm run tree` writes `data/cache/tree.json` and prints an indented outline with
page ranges and token counts — **check this by hand against the PDF's contents
page.**

## 7. Verification checklist (Phase 1–2)

- [ ] Every chapter in the contents page appears in the tree with the right start page.
- [ ] 5 random tables: markdown matches the PDF cell by cell (numbers + headers).
- [ ] 3 figures: descriptions contain only labelled values.
- [ ] 2 boxes detected as boxes with titles.
- [ ] No running headers/footers left in paragraphs.
- [ ] Fidelity report: list of fallback pages reviewed.
