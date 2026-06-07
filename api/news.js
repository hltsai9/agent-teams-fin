// Vercel serverless function — proxies stock news RSS and returns parsed items.
// GET /api/news?symbol=AAPL
//
// Tries Yahoo Finance RSS first; falls back to Google News RSS when Yahoo
// rate-limits datacenter IPs (frequent 429s from Vercel's egress).

import { parseRss } from '../lib/parse-rss.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FEEDS = (symbol) => [
  {
    source: 'Yahoo Finance',
    url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`,
  },
  {
    source: 'Google News',
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' stock')}&hl=en-US&gl=US&ceid=US:en`,
  },
];

async function fetchFeed(url) {
  const upstream = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!upstream.ok) {
    throw new Error(`upstream HTTP ${upstream.status}`);
  }
  return upstream.text();
}

export default async function handler(req, res) {
  const symbol = (req.query.symbol ?? '').trim().toUpperCase();

  if (!symbol) {
    res.status(400).json({ symbol: '', items: [], error: 'symbol query param required' });
    return;
  }

  let lastError = 'no feed available';
  for (const feed of FEEDS(symbol)) {
    try {
      const xml = await fetchFeed(feed.url);
      const items = parseRss(xml, 15, feed.source);
      if (items.length > 0) {
        res
          .status(200)
          .setHeader('Cache-Control', 's-maxage=600')
          .json({ symbol, items });
        return;
      }
      lastError = `empty feed from ${feed.source}`;
    } catch (err) {
      lastError = err.message ?? 'upstream fetch failed';
    }
  }

  res
    .status(502)
    .setHeader('Cache-Control', 's-maxage=600')
    .json({ symbol, items: [], error: lastError });
}
