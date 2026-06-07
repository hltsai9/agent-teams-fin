/**
 * test/quotes.test.js
 * Unit tests for lib/transform-quotes.js — all pure; no network calls.
 */

import { describe, it, expect } from 'vitest';
import { parseYahooChart, buildResponse } from '../lib/transform-quotes.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Minimal valid Yahoo Finance v8 chart body for one symbol. */
function makeYahooBody({
  symbol = 'AAPL',
  price = 213.55,
  prevClose = 212.32,
  currency = 'USD',
  timestamps = [1736121600, 1736208000],
  opens = [210.1, 211.0],
  highs = [214.2, 213.8],
  lows = [209.8, 210.5],
  closes = [212.32, 213.55],
} = {}) {
  return {
    chart: {
      result: [
        {
          meta: {
            symbol,
            regularMarketPrice: price,
            regularMarketPreviousClose: prevClose,
            chartPreviousClose: 100, // deliberately different — should NOT be used for daily change
            currency,
          },
          timestamp: timestamps,
          indicators: {
            quote: [{ open: opens, high: highs, low: lows, close: closes }],
          },
        },
      ],
      error: null,
    },
  };
}

// ---------------------------------------------------------------------------
// parseYahooChart
// ---------------------------------------------------------------------------

describe('parseYahooChart', () => {
  it('extracts price, change, changePct, currency from meta', () => {
    const body = makeYahooBody({ price: 213.55, prevClose: 212.32, currency: 'USD' });
    const result = parseYahooChart(body);

    expect(result.price).toBe(213.55);
    expect(result.change).toBeCloseTo(1.23, 2);
    expect(result.changePct).toBeCloseTo(0.5793, 2);
    expect(result.currency).toBe('USD');
  });

  it('builds history candles in ascending timestamp order', () => {
    // Supply out-of-order timestamps to exercise the sort
    const body = makeYahooBody({
      timestamps: [1736208000, 1736121600],
      opens: [211.0, 210.1],
      highs: [213.8, 214.2],
      lows: [210.5, 209.8],
      closes: [213.55, 212.32],
    });
    const { history } = parseYahooChart(body);

    expect(history).toHaveLength(2);
    expect(history[0].t).toBe(1736121600); // earlier timestamp first
    expect(history[1].t).toBe(1736208000);
  });

  it('skips null candles', () => {
    const body = makeYahooBody({
      timestamps: [1736121600, 1736208000, 1736294400],
      opens: [210.1, null, 211.5],
      highs: [214.2, null, 212.0],
      lows: [209.8, null, 210.0],
      closes: [212.32, null, 213.0],
    });
    const { history } = parseYahooChart(body);

    expect(history).toHaveLength(2);
    expect(history.every((c) => c.c !== null)).toBe(true);
  });

  it('candle fields are rounded to 4 decimal places', () => {
    const body = makeYahooBody({
      timestamps: [1736121600],
      opens: [210.12345678],
      highs: [214.99999],
      lows: [209.00001],
      closes: [213.55555555],
    });
    const { history } = parseYahooChart(body);

    expect(history[0].o).toBe(210.1235);
    expect(history[0].h).toBe(215.0);
    expect(history[0].l).toBe(209.0);
    expect(history[0].c).toBe(213.5556);
  });

  it('uses regularMarketPreviousClose (daily) not chartPreviousClose (range start) for change', () => {
    // chartPreviousClose = 100 (6-month-ago price — wrong baseline for daily change)
    // regularMarketPreviousClose = 212.32 (yesterday's close — correct daily baseline)
    const body = makeYahooBody({ price: 213.55, prevClose: 212.32 });
    // makeYahooBody already sets chartPreviousClose=100 and regularMarketPreviousClose=212.32
    // Verify the fixture is set up as expected
    expect(body.chart.result[0].meta.chartPreviousClose).toBe(100);
    expect(body.chart.result[0].meta.regularMarketPreviousClose).toBe(212.32);

    const result = parseYahooChart(body);

    // change should be 213.55 - 212.32 = 1.23, NOT 213.55 - 100 = 113.55
    expect(result.change).toBeCloseTo(1.23, 2);
    expect(result.changePct).toBeCloseTo(0.5793, 2);
  });

  it('throws when chart result is missing', () => {
    const badBody = { chart: { result: null, error: { description: 'Not Found' } } };
    expect(() => parseYahooChart(badBody)).toThrow('not found');
  });

  it('falls back to last close for price if meta.regularMarketPrice is absent', () => {
    const body = makeYahooBody({ price: 213.55, prevClose: 212.32 });
    // Remove regularMarketPrice from the fixture
    delete body.chart.result[0].meta.regularMarketPrice;
    // The last close is 213.55 (same value in fixture)
    const result = parseYahooChart(body);
    expect(result.price).toBe(213.55);
  });
});

// ---------------------------------------------------------------------------
// buildResponse
// ---------------------------------------------------------------------------

describe('buildResponse', () => {
  it('places successful parses into quotes[]', () => {
    const results = [
      { symbol: 'AAPL', data: makeYahooBody({ symbol: 'AAPL' }) },
    ];
    const { quotes, errors } = buildResponse(results);

    expect(quotes).toHaveLength(1);
    expect(quotes[0].symbol).toBe('AAPL');
    expect(errors).toHaveLength(0);
  });

  it('places pre-flagged errors into errors[]', () => {
    const results = [
      { symbol: 'BAD', error: 'invalid symbol' },
    ];
    const { quotes, errors } = buildResponse(results);

    expect(quotes).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({ symbol: 'BAD', error: 'invalid symbol' });
  });

  it('catches parse errors and puts them in errors[] without failing other symbols', () => {
    const results = [
      { symbol: 'AAPL', data: makeYahooBody({ symbol: 'AAPL' }) },
      { symbol: 'BROKEN', data: { chart: { result: null } } }, // will throw inside parseYahooChart
    ];
    const { quotes, errors } = buildResponse(results);

    expect(quotes).toHaveLength(1);
    expect(quotes[0].symbol).toBe('AAPL');
    expect(errors).toHaveLength(1);
    expect(errors[0].symbol).toBe('BROKEN');
  });

  it('handles a mix of valid symbols and errors gracefully', () => {
    const results = [
      { symbol: 'AAPL', data: makeYahooBody({ symbol: 'AAPL' }) },
      { symbol: 'MSFT', data: makeYahooBody({ symbol: 'MSFT' }) },
      { symbol: 'NOTREAL', error: 'not found' },
    ];
    const { quotes, errors } = buildResponse(results);

    expect(quotes).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({ symbol: 'NOTREAL', error: 'not found' });
  });

  it('returns empty arrays when given no results', () => {
    const { quotes, errors } = buildResponse([]);
    expect(quotes).toEqual([]);
    expect(errors).toEqual([]);
  });
});
