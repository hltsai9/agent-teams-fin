/**
 * api/quotes.js — Vercel serverless function
 * GET /api/quotes?symbols=AAPL,MSFT
 *
 * Fetches 6-month daily candles from Yahoo Finance for up to 10 symbols.
 * Per-symbol failures land in errors[]; one bad symbol never fails the whole response.
 */

import { buildResponse } from '../lib/transform-quotes.js';

const SYMBOL_RE = /^[A-Z.\-]{1,10}$/i;
const MAX_SYMBOLS = 10;
const YAHOO_URL = (symbol) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`;

// Yahoo rejects requests with default fetch User-Agents
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  const rawSymbols = req.query?.symbols ?? '';
  const symbolList = rawSymbols
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbolList.length === 0) {
    return res.status(400).json({ error: 'symbols query param required' });
  }

  // Partition valid vs invalid symbols immediately
  const valid = [];
  const invalid = [];
  for (const sym of symbolList.slice(0, MAX_SYMBOLS)) {
    if (SYMBOL_RE.test(sym)) {
      valid.push(sym);
    } else {
      invalid.push(sym);
    }
  }
  // Any symbols beyond MAX_SYMBOLS are also errors
  for (const sym of symbolList.slice(MAX_SYMBOLS)) {
    invalid.push(sym);
  }

  // Fetch all valid symbols in parallel
  const fetches = valid.map(async (symbol) => {
    try {
      const response = await fetch(YAHOO_URL(symbol), {
        headers: { 'User-Agent': BROWSER_UA },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        const msg = response.status === 404 ? 'not found' : `upstream error ${response.status}`;
        return { symbol, error: msg };
      }
      const data = await response.json();
      return { symbol, data };
    } catch (err) {
      return { symbol, error: err.message ?? 'fetch error' };
    }
  });

  const fetchResults = await Promise.all(fetches);

  // Prepend invalid-symbol errors (no fetch attempted for these)
  const allResults = [
    ...invalid.map((symbol) => ({ symbol, error: 'invalid symbol' })),
    ...fetchResults,
  ];

  const body = buildResponse(allResults);

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  return res.status(200).json(body);
}
