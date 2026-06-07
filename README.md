# Stock Trend Dashboard

A responsive stock-market dashboard with news-aware buy/hold/wait signals.

> **DISCLAIMER: This software is for informational and educational purposes only. Nothing here constitutes financial advice. Do not make investment decisions based on this tool.**

---

## Architecture

```
stock-trend-dashboard/
├── api/
│   ├── quotes.js          # Serverless: proxies Yahoo Finance chart API (6-month daily candles)
│   └── news.js            # Serverless: proxies Yahoo Finance RSS headlines
├── public/
│   ├── index.html         # Single-page dashboard (vanilla JS, no build step)
│   ├── app.js             # Frontend logic: fetches quotes + news, renders charts + signals
│   └── signals.js         # Client-side copy of lib/signals.js (kept in sync)
├── lib/
│   ├── signals.js         # Pure ESM signals engine (SMA, RSI, sentiment, computeSignal)
│   └── parse-rss.js       # Pure ESM RSS parser (no dependencies)
├── test/                  # Vitest test suites
├── scripts/
│   └── dev-server.mjs     # Local dev harness (no Vercel CLI needed)
├── docs/
│   └── contracts.md       # API + lib interface contracts
├── vercel.json            # Vercel deployment config
└── package.json
```

**Data flow:**
1. Browser loads `public/index.html` and `public/app.js`.
2. `app.js` calls `/api/quotes?symbols=AAPL,...` (up to 10 symbols from localStorage watchlist).
3. `app.js` calls `/api/news?symbol=X` per symbol.
4. Signals computed client-side via `public/signals.js` (RSI, SMA20/SMA50, news sentiment).
5. Charts rendered with lightweight-charts v4 from unpkg CDN.

---

## Local Development

### Option A — lightweight dev server (no Vercel CLI)

```bash
npm install
node scripts/dev-server.mjs
# Opens on http://localhost:3000 by default
```

The dev server statically serves `public/` and mounts `api/quotes.js` and `api/news.js`
as HTTP handlers at `/api/quotes` and `/api/news` — identical routing to Vercel.

### Option B — Vercel dev CLI

```bash
npm install
npx vercel dev
```

---

## Running Tests

```bash
npm test
# or
npx vitest run
```

All suites run against `lib/signals.js` and `lib/parse-rss.js` (pure, no network).

---

## Deployment

```bash
npx vercel --prod
```

You will be prompted to authenticate with your Vercel account. The project uses:
- `public/` as the static output directory
- `api/` as serverless function handlers (auto-detected by Vercel)
- No build step required

---

## Watchlist

Default symbols: `AAPL`, `MSFT`, `NVDA`, `GOOGL`, `TSLA`.
The watchlist is stored in `localStorage['watchlist']` and can be edited in the UI.

---

> **NOT FINANCIAL ADVICE.** This tool is a demonstration project. Stock data is sourced from Yahoo Finance and may be delayed or inaccurate. Always consult a qualified financial professional before making investment decisions.
