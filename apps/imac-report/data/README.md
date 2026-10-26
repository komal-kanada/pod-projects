Put the source report here as `imac-environmental-report.pdf`.

`pnpm render` and `pnpm extract` cache their work in `data/cache/` (gitignored):
page PNGs, the text layer with font sizes, and each strategy's elements per page.

Optional: `data/overrides.json` fixes specific extracted values by element key
(see docs/04 §6). Overrides are applied at ingest and never count toward the
extraction scores.
