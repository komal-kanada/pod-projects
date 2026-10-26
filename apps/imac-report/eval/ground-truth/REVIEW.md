# Ground truth — draft for review

Drafted 2026-10-16 from the page images (`data/cache/pages/`) and the PDF's own
text layer — **not** from any strategy's extraction, so scoring X0–X2 against it
stays honest. Every coverage fact and footnote-link snippet was checked to occur
verbatim in the PDF text of its page.

Open the PDF next to each file, fix anything wrong, then delete this file.

## What to check

- [ ] **tables.json** — 3 tables: the two on p.10 and the power-consumption table on p.12.
  - Bullets ("• Production") are kept, as printed; footnote markers ("achieved⁷") are left out (the scorer strips them).
  - p.12's header spans two rows ("Power consumption for iMac" above 100V/115V/230V);
    labelled here as columns `Mode, 100V, 115V, 230V` with the spanning header as the title.
  - p.10 prints "CO₂e"; labelled as "CO2e" (the scorer treats them the same).
- [ ] **charts.json** — 1 chart (p.2). Only the three printed values are labelled
  (445 kg, –99 kg, 346 kg); the coloured segments carry no numbers, so none are listed.
- [ ] **footnotes.json** — endnotes 1–19, text taken from the PDF text layer.
  - 18's text stops at "(2m)."; the mode definitions and the table beneath it are separate elements.
  - 6 has no `referencedBy`: its marker sits on the EPEAT logo (p.1), not on any text.
  - Endnote 10 says "two ports with 512GB" while p.2/p.10 say 256GB — that's how the report reads; left as printed.
- [ ] **coverage.json** — 3–5 key facts per page, short verbatim phrases.

## Already visible

X1 misses the p.12 power-consumption table entirely, extracts the p.2 chart with no
values (X2 also loses its title), and links only 4 of the
footnote references — the scores will show both.
