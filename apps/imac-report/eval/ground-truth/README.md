# Ground truth (hand-labelled from the PDF)

Format and rules: `docs/10-evaluation.md §1`. Label exactly what is printed.

```jsonc
// tables.json
[{ "page": 4, "title": "Energy consumption", "columns": ["Mode", "iMac (two ports)"], "rows": [["Sleep", "0.9 W"]] }]
// charts.json — labelled values only
[{ "page": 3, "title": "Life cycle carbon emissions", "chartType": "stacked_bar",
   "points": [{ "series": "iMac 24-inch", "label": "Production", "valueText": "70%" }] }]
// footnotes.json
[{ "marker": "1", "page": 3, "text": "Use phase assumes …", "referencedBy": [{ "page": 3, "snippet": "carbon emissions" }] }]
// coverage.json — 3–5 important facts per page, including callouts
[{ "page": 2, "facts": ["100 percent recycled aluminium"] }]
```
