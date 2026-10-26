# Chunking and Metadata

## 1. Why hierarchical

Two conflicting needs:

- **Retrieval** wants *small*, single-topic units — one embedding per idea, so the
  vector isn't averaged across topics.
- **Generation** wants *big*, coherent context — the full argument, the table's
  headers, the region and year that the small unit doesn't repeat.

Solution: **index small, answer big.** Retrieve child chunks; hand the model
their parent section (or a window of it).

## 2. Chunk kinds

| Kind | Built from | Size | Embedded? | Sent to LLM? |
| --- | --- | --- | --- | --- |
| `child` | Paragraphs/lists within one leaf section | target 1600 chars (~400 tok), max 2400, overlap 1 sentence | ✓ | via parent expansion |
| `table` | One table (+ caption, notes, footnotes) | whole table; if > 6000 chars split by row groups, **header row repeated** in each part | ✓ (header + caption + table summary line) | ✓ whole |
| `figure` | Figure title + Gemini description + source line | small | ✓ | ✓ |
| `box` | One box | as `child` chunks inside a box section node | ✓ | via parent (the box) |
| `summary` | Gemini summary of a section/chapter (B6) | 80–200 words | ✓ | ✗ routing only |
| `flat` | B0/B1 fixed-size chunks | 3200 chars, 400 overlap | ✓ | ✓ |

A **parent** is the leaf section node (`sections` row). If the leaf section is
larger than `parentMaxTokens` (default 2000), the parent becomes a **window**:
the child plus neighbours in the same section until the window fills (see 06 §6).

### Child chunking algorithm (`chunking/hierarchical.ts`)

1. For each leaf section, take its paragraph/list blocks in order.
2. Pack whole blocks up to the target; a block over max is split by sentences.
3. Never cross a section boundary. Never include a table/figure inside a child —
   they become their own chunks, with a `[See Table 1.2]` placeholder sentence left
   in the child so the child still reads naturally.
4. Overlap: the last sentence of the previous child is prepended.
5. Record `section_id`, `ordinal` (position within section), `page_start/end`.

### Table chunks (`chunking/special-blocks.ts`)

- `content` = caption + markdown table + notes (what the LLM sees).
- `embed_text` = breadcrumb + caption + **a one-line table summary** generated at
  ingest ("Real GDP growth forecasts by region, 2023–2027, percent") + header row +
  first column labels. Embedding raw numeric grids is close to useless; embedding
  *what the table is about* is not.
- Both kinds are also full-text indexed on `content`, so exact numbers and country
  names match via keyword search.

## 3. Contextual header

Every embedded unit gets a breadcrumb prefix:

```text
World Bank Economic Report › Chapter 2 Regional Outlooks › South Asia › Outlook
[Region: South Asia] [Years: 2025, 2026] [Type: text] [Pages: 87–88]
<chunk text>
```

This is the cheapest high-impact fix for "chunk lost its context": a paragraph
that only says "growth is projected to slow" is now embedded as being about
South Asia's outlook.

**Optional experiment (E-ctx):** LLM-generated contextual sentence per chunk
("This passage describes …") à la contextual retrieval. Measured against the
breadcrumb-only header; kept only if it wins enough to justify the cost.

## 4. Metadata (`metadata/extract.ts`)

All deterministic — no LLM — so it's cheap, reproducible, and testable.

| Field | Type | How |
| --- | --- | --- |
| `section_id`, `section_path` | uuid, text[] | From tree |
| `chapter` | text | Top-level section title |
| `content_type` | enum | `text · table · figure · box · summary · flat` |
| `page_start`, `page_end`, labels | int, text | From blocks |
| `regions` | text[] | Inherited from section path **∪** matches in text against `vocab.ts` (EAP, ECA, LAC, MNA, SAR, SSA + full names + aliases like "Middle East and North Africa", "MENA") |
| `countries` | text[] | ISO3 codes from a country-name/alias dictionary (incl. "Türkiye"/"Turkey", "Côte d'Ivoire") |
| `years` | int[] | 4-digit years 1990–2035 in text + table headers; FY patterns (`FY24`) normalised |
| `is_forecast` | bool | Table cells/headers with `f`/`e`/"forecast"/"projected", or text verbs ("projected", "expected to", "forecast") near a year ≥ report year |
| `parse_source` | text | `gemini` or `text_layer` (fallback pages) |
| `token_count` | int | chars/4 |

Region/country dictionaries live in `lib/metadata/vocab.ts` — also used to
**validate** filters proposed by query analysis (06 §2).

## 5. Summaries (`structure/summaries.ts`, B6)

Bottom-up over the tree:

1. Leaf sections: summarise from their own text (+ table captions), 80–150 words,
   must keep key figures with year and region.
2. Parent sections / chapters: summarise from children's summaries, ≤ 200 words.
3. A whole-report summary node (≤ 300 words).

Stored as `chunks` with `content_type = 'summary'`, linked to their section,
embedded with the breadcrumb header. Cached by `sha256(section text) + prompt version`.

Used for:
- routing broad questions to the right sections (06 §3),
- the Document Map UI.

Never cited as evidence.

## 6. Expected scale (estimate, ~200 pages)

| Item | Approx. count |
| --- | --- |
| Sections (all levels) | 150–300 |
| Child chunks | 900–1,400 |
| Table chunks | 60–150 |
| Figure chunks | 80–150 |
| Summary nodes | 150–300 |

~2–2.5k vectors → exact search is still fast; an HNSW index is optional.
