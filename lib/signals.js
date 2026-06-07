// lib/signals.js — pure technical-indicator and sentiment functions, ESM, zero deps
// Copied verbatim to public/signals.js (see build step / quant agent).

import { lexicon as defaultLexicon } from './sentiment-lexicon.js';

// ---------------------------------------------------------------------------
// sma — simple moving average of the last n closes
// Returns null when there are fewer than n data points.
// ---------------------------------------------------------------------------
export function sma(closes, n) {
  if (!closes || closes.length < n) return null;
  const slice = closes.slice(closes.length - n);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return sum / n;
}

// ---------------------------------------------------------------------------
// rsi — Wilder's Smoothed RSI(period)
//
// Seed: simple mean of first `period` gains/losses (from period+1 closes).
// Smoothing thereafter: avg = (prevAvg * (period-1) + current) / period.
// RSI = 100 − 100 / (1 + RS),  RS = avgGain / avgLoss.
// Edge cases: RSI = 100 if avgLoss === 0 (all gains); 0 if avgGain === 0.
// Returns null if fewer than period+1 closes are provided.
// ---------------------------------------------------------------------------
export function rsi(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;

  // Compute raw gain/loss for every consecutive pair
  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Seed: simple average of first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const c = changes[i];
    if (c > 0) avgGain += c;
    else avgLoss += -c;
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder smoothing for any additional changes beyond the seed window
  for (let i = period; i < changes.length; i++) {
    const c = changes[i];
    const gain = c > 0 ? c : 0;
    const loss = c < 0 ? -c : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ---------------------------------------------------------------------------
// sentiment — score headlines against a lexicon
//
// Performs case-insensitive whole-word matching of each lexicon term across
// all title strings. Returns { score, pos, neg } where score = pos − neg.
// ---------------------------------------------------------------------------
export function sentiment(titles, lexicon) {
  if (!titles || titles.length === 0) return { score: 0, pos: 0, neg: 0 };

  let pos = 0;
  let neg = 0;

  // Pre-compile a regex per term for whole-word, case-insensitive matching
  const match = (text, terms) => {
    let count = 0;
    for (const term of terms) {
      const re = new RegExp(`\\b${term}\\b`, 'gi');
      const found = text.match(re);
      if (found) count += found.length;
    }
    return count;
  };

  for (const title of titles) {
    pos += match(title, lexicon.positive);
    neg += match(title, lexicon.negative);
  }

  return { score: pos - neg, pos, neg };
}

// ---------------------------------------------------------------------------
// computeSignal — combine RSI, SMA trend, and news sentiment into a signal
//
// Input: { history (candle array from /api/quotes), newsTitles (string[]) }
// history candle shape: { t, o, h, l, c }
// Scoring rules (quant.md):
//   RSI < 30  → +2 "RSI oversold"
//   RSI > 70  → −2 "RSI overbought"
//   SMA20 > SMA50 → +1 "uptrend: SMA20 above SMA50"
//   SMA20 < SMA50 → −1 "downtrend"
//   sentiment > 0 → +1  · < 0 → −1
// Total ≥ 2 → BUY · ≤ −2 → WAIT · else HOLD
// Returns { signal, score, reasons: string[] }
// ---------------------------------------------------------------------------
export function computeSignal({ history, newsTitles } = {}) {
  const safeHistory = history || [];
  const safeTitles = newsTitles || [];

  const closes = safeHistory.map((x) => x.c);
  const reasons = [];
  let score = 0;

  // RSI factor
  const rsiVal = rsi(closes, 14);
  if (rsiVal !== null) {
    if (rsiVal < 30) {
      score += 2;
      reasons.push(`RSI oversold (RSI=${rsiVal.toFixed(2)})`);
    } else if (rsiVal > 70) {
      score -= 2;
      reasons.push(`RSI overbought (RSI=${rsiVal.toFixed(2)})`);
    }
  }

  // SMA trend factor
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  if (sma20 !== null && sma50 !== null) {
    if (sma20 > sma50) {
      score += 1;
      reasons.push(`uptrend: SMA20 above SMA50 (SMA20=${sma20.toFixed(2)}, SMA50=${sma50.toFixed(2)})`);
    } else if (sma20 < sma50) {
      score -= 1;
      reasons.push(`downtrend (SMA20=${sma20.toFixed(2)} < SMA50=${sma50.toFixed(2)})`);
    }
  }

  // Sentiment factor
  const { score: sentScore } = sentiment(safeTitles, defaultLexicon);
  if (sentScore > 0) {
    score += 1;
    reasons.push(`positive news sentiment (score=${sentScore})`);
  } else if (sentScore < 0) {
    score -= 1;
    reasons.push(`negative news sentiment (score=${sentScore})`);
  }

  const signal = score >= 2 ? 'BUY' : score <= -2 ? 'WAIT' : 'HOLD';
  return { signal, score, reasons };
}
