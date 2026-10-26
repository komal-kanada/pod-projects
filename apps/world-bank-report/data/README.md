Put the source report here as `world-bank-report.pdf`.

`pnpm parse` caches its work in `data/cache/` (gitignored): the text layer,
Gemini page markdown (by page + prompt version, so re-runs are free and
resumable), the fidelity report and `tree.json`.
