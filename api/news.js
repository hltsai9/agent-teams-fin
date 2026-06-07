// Vercel serverless function — proxies Yahoo Finance RSS and returns parsed news.
// GET /api/news?symbol=AAPL

import { parseRss } from '../lib/parse-rss.js';

export default async function handler(req, res) {
  const symbol = (req.query.symbol ?? '').trim().toUpperCase();

  if (!symbol) {
    res.status(400).json({ symbol: '', items: [], error: 'symbol query param required' });
    return;
  }

  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;

  let xml;
  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      throw new Error(`upstream HTTP ${upstream.status}`);
    }

    xml = await upstream.text();
  } catch (err) {
    res
      .status(502)
      .setHeader('Cache-Control', 's-maxage=600')
      .json({ symbol, items: [], error: err.message ?? 'upstream fetch failed' });
    return;
  }

  const items = parseRss(xml, 15);

  res
    .status(200)
    .setHeader('Cache-Control', 's-maxage=600')
    .json({ symbol, items });
}
