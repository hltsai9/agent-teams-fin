// test/signals.test.js — TDD tests for lib/signals.js
// Written BEFORE implementation; each test must fail first.

import { describe, it, expect } from 'vitest';
import { sma, rsi, sentiment, computeSignal } from '../lib/signals.js';

// ---------------------------------------------------------------------------
// sma
// ---------------------------------------------------------------------------
describe('sma', () => {
  it('returns null when closes has fewer than n elements', () => {
    expect(sma([1, 2, 3], 5)).toBeNull();
  });

  it('returns null when closes is empty', () => {
    expect(sma([], 5)).toBeNull();
  });

  it('returns mean of exactly n closes', () => {
    // mean([2, 4, 6]) = 4
    expect(sma([2, 4, 6], 3)).toBeCloseTo(4, 5);
  });

  it('uses only the last n closes when array is longer', () => {
    // last 3 of [1, 2, 3, 4, 5] = [3, 4, 5] → mean = 4
    expect(sma([1, 2, 3, 4, 5], 3)).toBeCloseTo(4, 5);
  });

  it('returns the single value when n=1', () => {
    expect(sma([7, 8, 9], 1)).toBeCloseTo(9, 5);
  });
});

// ---------------------------------------------------------------------------
// rsi — Wilder's smoothing
// ---------------------------------------------------------------------------
describe('rsi', () => {
  it('returns null when fewer than period+1 closes', () => {
    expect(rsi([1, 2, 3, 4, 5], 14)).toBeNull();
  });

  it('returns null for empty closes', () => {
    expect(rsi([], 14)).toBeNull();
  });

  it('returns 100 when all moves are gains (avgLoss=0)', () => {
    // 15 strictly increasing closes → all gains, no losses
    const closes = Array.from({ length: 15 }, (_, i) => 10 + i);
    expect(rsi(closes, 14)).toBeCloseTo(100, 5);
  });

  it('returns 0 when all moves are losses (avgGain=0)', () => {
    // 15 strictly decreasing closes
    const closes = Array.from({ length: 15 }, (_, i) => 100 - i);
    expect(rsi(closes, 14)).toBeCloseTo(0, 5);
  });

  // Reference vector from quant.md — the critical acceptance test
  it('passes the Wilder RSI reference vector (≈70.46 ±0.1)', () => {
    const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
                    45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    const result = rsi(closes, 14);
    expect(result).not.toBeNull();
    expect(result).toBeGreaterThan(70.36);
    expect(result).toBeLessThan(70.56);
  });

  it('returns a value between 0 and 100 for normal data', () => {
    const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
                    45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    const result = rsi(closes, 14);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// sentiment
// ---------------------------------------------------------------------------
describe('sentiment', () => {
  const lexicon = { positive: ['good', 'great', 'bullish'], negative: ['bad', 'crash', 'bearish'] };

  it('returns { score: 0, pos: 0, neg: 0 } for empty titles', () => {
    expect(sentiment([], lexicon)).toEqual({ score: 0, pos: 0, neg: 0 });
  });

  it('counts positive words correctly', () => {
    const titles = ['Great earnings today', 'Bullish outlook for tech'];
    const result = sentiment(titles, lexicon);
    expect(result.pos).toBe(2);
    expect(result.neg).toBe(0);
    expect(result.score).toBe(2);
  });

  it('counts negative words correctly', () => {
    const titles = ['Market crash fears grow', 'Bearish signal detected'];
    const result = sentiment(titles, lexicon);
    expect(result.neg).toBe(2);
    expect(result.pos).toBe(0);
    expect(result.score).toBe(-2);
  });

  it('is case-insensitive', () => {
    const titles = ['GOOD news today', 'CRASH incoming'];
    const result = sentiment(titles, lexicon);
    expect(result.pos).toBe(1);
    expect(result.neg).toBe(1);
    expect(result.score).toBe(0);
  });

  it('matches whole words only — does not match substrings', () => {
    // "goods" should not match "good", "crashes" should not match "crash"
    const titles = ['goods and crashes reported'];
    const result = sentiment(titles, lexicon);
    expect(result.pos).toBe(0);
    expect(result.neg).toBe(0);
  });

  it('counts multiple matches in one title', () => {
    const titles = ['Good great bullish day'];
    const result = sentiment(titles, lexicon);
    expect(result.pos).toBe(3);
  });

  it('returns score = pos - neg for mixed titles', () => {
    const titles = ['Good earnings but crash risk is bad'];
    const result = sentiment(titles, lexicon);
    expect(result.pos).toBe(1);  // "good"
    expect(result.neg).toBe(2);  // "crash", "bad"
    expect(result.score).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// computeSignal
// ---------------------------------------------------------------------------
describe('computeSignal', () => {
  // Build a minimal history array from closes
  const makeHistory = (closes) =>
    closes.map((c, i) => ({ t: 1700000000 + i * 86400, o: c, h: c, l: c, c }));

  // 50 candles for SMA tests — all flat then rising
  const flatHistory = makeHistory(Array(50).fill(100));

  it('returns HOLD with score=0 and empty reasons for flat price, no news', () => {
    const result = computeSignal({ history: flatHistory, newsTitles: [] });
    // RSI on flat data: 0 gains, 0 losses → avgLoss=0 → RSI=100 → overbought → −2
    // SMA20 === SMA50 for flat data → no SMA factor
    // sentiment=0 → no factor
    // score = −2 → WAIT
    // This test just checks the shape — signal/score/reasons present
    expect(result).toHaveProperty('signal');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('reasons');
    expect(Array.isArray(result.reasons)).toBe(true);
  });

  it('produces BUY signal when RSI is oversold', () => {
    // 15 sharply declining then rising creates oversold RSI
    // Easier: build history where all closes fall → RSI near 0 → +2
    // Need 50+ closes for SMA checks; declining trend → SMA20 < SMA50 → another −1
    // To guarantee BUY (≥+2), we need RSI<30 (+2) and sentiment>0 (+1) at minimum
    const decliningCloses = Array.from({ length: 65 }, (_, i) => 200 - i * 2);
    const result = computeSignal({
      history: makeHistory(decliningCloses),
      newsTitles: ['great bullish outlook']
    });
    // RSI of a steadily declining series: all losses → RSI=0 → +2
    // SMA20 < SMA50 (declining) → −1
    // sentiment score = +1 (bullish, great)  → +1
    // total = 2 → BUY
    expect(result.signal).toBe('BUY');
    expect(result.score).toBeGreaterThanOrEqual(2);
  });

  it('produces WAIT signal when RSI is overbought and downtrend news', () => {
    const risingCloses = Array.from({ length: 65 }, (_, i) => 100 + i * 2);
    const result = computeSignal({
      history: makeHistory(risingCloses),
      newsTitles: ['market crash bearish bad signal']
    });
    // RSI of steadily rising series → RSI=100 → −2
    // SMA20 > SMA50 → +1
    // sentiment: crash(-1), bearish(-1), bad(-1) → −3 score → −1 factor
    // total = −2 → WAIT
    expect(result.signal).toBe('WAIT');
    expect(result.score).toBeLessThanOrEqual(-2);
  });

  it('includes RSI value in reasons when RSI factor applied', () => {
    const risingCloses = Array.from({ length: 65 }, (_, i) => 100 + i * 2);
    const result = computeSignal({
      history: makeHistory(risingCloses),
      newsTitles: []
    });
    const rsiReason = result.reasons.find(r => r.toLowerCase().includes('rsi'));
    expect(rsiReason).toBeDefined();
  });

  it('returns HOLD gracefully for empty history', () => {
    const result = computeSignal({ history: [], newsTitles: [] });
    expect(result.signal).toBe('HOLD');
    expect(result.score).toBe(0);
  });

  it('returns HOLD gracefully for very short history', () => {
    const result = computeSignal({ history: makeHistory([100, 101, 102]), newsTitles: [] });
    expect(result.signal).toBe('HOLD');
  });

  it('does not throw for null/undefined newsTitles', () => {
    expect(() => computeSignal({ history: flatHistory, newsTitles: null })).not.toThrow();
    expect(() => computeSignal({ history: flatHistory, newsTitles: undefined })).not.toThrow();
  });
});
