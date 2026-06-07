# Interface Contracts

All teammates code against these contracts. Do not change a contract without telling team-lead.

## GET /api/quotes?symbols=AAPL,MSFT

`api/quotes.js` (Vercel serverless, ESM `export default async function handler(req, res)`)

```json
{
  "quotes": [
    {
      "symbol": "AAPL",
      "price": 213.55,
      "change": 1.23,
      "changePct": 0.58,
      "currency": "USD",
      "history": [ { "t": 1736121600, "o": 210.1, "h": 214.2, "l": 209.8, "c": 213.55 } ]
    }
  ],
  "errors": [ { "symbol": "BAD", "error": "not found" } ]
}
```

- `history`: ~6 months of daily candles, ascending by `t` (unix seconds). Null candles skipped.
- Max 10 symbols per request; invalid symbols go to `errors`, never fail the whole response.
- Upstream: `https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?range=6mo&interval=1d`

## GET /api/news?symbol=AAPL

`api/news.js` (Vercel serverless, ESM)

```json
{
  "symbol": "AAPL",
  "items": [
    { "title": "Apple beats earnings", "link": "https://…", "pubDate": "Mon, 02 Jun 2026 14:00:00 GMT", "source": "Yahoo Finance" }
  ]
}
```

- Max 15 items. On upstream failure: HTTP 502 with `{ "symbol": "...", "items": [], "error": "message" }`.
- Upstream RSS: `https://feeds.finance.yahoo.com/rss/2.0/headline?s={SYMBOL}&region=US&lang=en-US`

## lib/signals.js (pure, ESM — also copied verbatim to public/signals.js)

```js
sma(closes, n)                       // → number | null (insufficient data)
rsi(closes, period = 14)             // → number | null — Wilder's smoothing
sentiment(titles, lexicon)           // → { score, pos, neg }
computeSignal({ history, newsTitles }) // → { signal: 'BUY'|'HOLD'|'WAIT', score, reasons: string[] }
```

- `history` is the quotes-contract candle array; closes = `history.map(x => x.c)`.
- Scoring: RSI<30 → +2 · RSI>70 → −2 · SMA20>SMA50 → +1 · SMA20<SMA50 → −1 · news sentiment >0 → +1 / <0 → −1.
  Total ≥2 → BUY · ≤−2 → WAIT · else HOLD. Each contributing factor adds a human-readable string to `reasons`.

## Frontend (public/)

- Vanilla JS, no build step. lightweight-charts v4 standalone from unpkg CDN.
- Watchlist in `localStorage['watchlist']` (JSON array), default `["AAPL","MSFT","NVDA","GOOGL","TSLA"]`.
- Calls `/api/quotes` once with all symbols; `/api/news` per symbol; computes signals client-side via `public/signals.js`.
