# Research

Put research files (PDFs) in this folder. Then list each one in `data/research.json` so it shows up on Skope's Research page and in the Research tab for the tickers it covers.

## Adding a report

1. Upload the file here, for example `research/JBHT-2026-11.pdf` (on GitHub, open this folder, then **Add file → Upload files**).
2. Add an entry to `data/research.json`:

```json
[
  {
    "title": "J.B. Hunt: Intermodal Recovery Underpriced",
    "tickers": ["JBHT"],
    "date": "2026-11-12",
    "rating": "Buy",
    "summary": "One or two sentences on the thesis.",
    "url": "research/JBHT-2026-11.pdf"
  }
]
```

- `title`, `url`: required. `url` can be a file in this folder (`research/...`) or a full `https://` link, such as a Cherry St Capital post.
- `tickers`: the stocks it covers. The report appears in the Research tab when anyone runs those tickers, or holds them in a portfolio.
- `date` (YYYY-MM-DD), `rating`, `summary`: optional. Newest reports are listed first.

## Disclaimer

Skope shows this disclaimer on the Research page and in every Research tab:

> **Opinion, not advice.** Research on Skope reflects my personal opinions as of the date written. It is for informational and educational purposes only and is not financial, investment, tax or legal advice, or a recommendation to buy, sell or hold any security. I may hold positions in securities discussed. Do your own research and consult a licensed professional before making investment decisions.

Put the same text in the PDF itself (first or last page), since people can download and share the file without seeing Skope's page.
