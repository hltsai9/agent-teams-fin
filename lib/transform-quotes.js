/**
 * transform-quotes.js — pure response-shaping logic for Yahoo Finance chart data.
 * No network calls here; all parsing lives here so it can be unit-tested with fixtures.
 */

/**
 * Parse one Yahoo Finance v8 chart response into the contract candle shape.
 *
 * @param {object} body - parsed JSON body from Yahoo Finance
 * @returns {{ price, change, changePct, currency, history }}
 */
export function parseYahooChart(body) {
  const result = body?.chart?.result?.[0];
  if (!result) {
    throw new Error('not found');
  }

  const meta = result.meta ?? {};
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const opens = quote.open ?? [];
  const highs = quote.high ?? [];
  const lows = quote.low ?? [];
  const closes = quote.close ?? [];

  // Build candle array, skipping entries where any value is null
  const history = [];
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    // Skip null candles
    if (t == null || o == null || h == null || l == null || c == null) continue;
    history.push({
      t,
      o: round4(o),
      h: round4(h),
      l: round4(l),
      c: round4(c),
    });
  }

  // Sort ascending by timestamp (Yahoo generally returns them in order, but be safe)
  history.sort((a, b) => a.t - b.t);

  const price = round4(meta.regularMarketPrice ?? closes.at(-1) ?? 0);
  // Use regularMarketPreviousClose (daily) not chartPreviousClose (start of range).
  // Falls back to second-to-last close if meta fields are absent.
  const prevClose = round4(
    meta.regularMarketPreviousClose ?? meta.previousClose ?? closes.at(-2) ?? 0
  );
  const change = round4(price - prevClose);
  const changePct = prevClose !== 0 ? round4((change / prevClose) * 100) : 0;
  const currency = meta.currency ?? 'USD';

  return { price, change, changePct, currency, history };
}

/**
 * Shape the results of multiple symbol fetches into the API contract envelope.
 *
 * @param {{ symbol: string, data?: object, error?: string }[]} results
 * @returns {{ quotes: object[], errors: object[] }}
 */
export function buildResponse(results) {
  const quotes = [];
  const errors = [];

  for (const { symbol, data, error } of results) {
    if (error) {
      errors.push({ symbol, error });
    } else {
      try {
        const parsed = parseYahooChart(data);
        quotes.push({ symbol, ...parsed });
      } catch (err) {
        errors.push({ symbol, error: err.message ?? 'parse error' });
      }
    }
  }

  return { quotes, errors };
}

/** Round to 4 decimal places (mirrors typical financial display precision). */
function round4(n) {
  return Math.round(n * 10000) / 10000;
}
