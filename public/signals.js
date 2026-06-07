// public/signals.js — browser-compatible build of lib/signals.js
// Lexicon inlined so there are no relative imports that break in the browser.
// Logic is identical to lib/signals.js; keep both in sync.

// ---------------------------------------------------------------------------
// Sentiment lexicon (mirrors lib/sentiment-lexicon.js)
// ---------------------------------------------------------------------------
const defaultLexicon = {
  positive: [
    'beat', 'beats', 'bullish', 'buy', 'gain', 'gains', 'good', 'great',
    'growth', 'high', 'higher', 'jump', 'jumps', 'outperform', 'outperforms',
    'positive', 'profit', 'profits', 'rally', 'record', 'rise', 'rises',
    'soar', 'soars', 'strong', 'surge', 'surges', 'upgrade', 'upgrades',
    'upside', 'win', 'wins',
  ],
  negative: [
    'bad', 'bearish', 'crash', 'crashes', 'cut', 'cuts', 'decline', 'declines',
    'default', 'deficit', 'disappoint', 'disappoints', 'downgrade', 'downgrades',
    'downside', 'drop', 'drops', 'fall', 'falls', 'fear', 'fears', 'headwind',
    'headwinds', 'layoff', 'layoffs', 'loss', 'losses', 'miss', 'misses',
    'negative', 'plunge', 'plunges', 'recession', 'risk', 'sell', 'slump',
    'slumps', 'tumble', 'tumbles', 'warning', 'weak', 'worst',
  ],
};

export function sma(closes, n) {
  if (!closes || closes.length < n) return null;
  const slice = closes.slice(closes.length - n);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return sum / n;
}

export function rsi(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const c = changes[i];
    if (c > 0) avgGain += c;
    else avgLoss += -c;
  }
  avgGain /= period;
  avgLoss /= period;
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

export function sentiment(titles, lexicon) {
  if (!titles || titles.length === 0) return { score: 0, pos: 0, neg: 0 };
  let pos = 0;
  let neg = 0;
  const match = (text, terms) => {
    let count = 0;
    for (const term of terms) {
      const re = new RegExp('\\b' + term + '\\b', 'gi');
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

export function computeSignal({ history, newsTitles } = {}) {
  const safeHistory = history || [];
  const safeTitles = newsTitles || [];
  const closes = safeHistory.map((x) => x.c);
  const reasons = [];
  let score = 0;

  const rsiVal = rsi(closes, 14);
  if (rsiVal !== null) {
    if (rsiVal < 30) {
      score += 2;
      reasons.push('RSI oversold (RSI=' + rsiVal.toFixed(2) + ')');
    } else if (rsiVal > 70) {
      score -= 2;
      reasons.push('RSI overbought (RSI=' + rsiVal.toFixed(2) + ')');
    }
  }

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  if (sma20 !== null && sma50 !== null) {
    if (sma20 > sma50) {
      score += 1;
      reasons.push('uptrend: SMA20 above SMA50 (SMA20=' + sma20.toFixed(2) + ', SMA50=' + sma50.toFixed(2) + ')');
    } else if (sma20 < sma50) {
      score -= 1;
      reasons.push('downtrend (SMA20=' + sma20.toFixed(2) + ' < SMA50=' + sma50.toFixed(2) + ')');
    }
  }

  const { score: sentScore } = sentiment(safeTitles, defaultLexicon);
  if (sentScore > 0) {
    score += 1;
    reasons.push('positive news sentiment (score=' + sentScore + ')');
  } else if (sentScore < 0) {
    score -= 1;
    reasons.push('negative news sentiment (score=' + sentScore + ')');
  }

  const signal = score >= 2 ? 'BUY' : score <= -2 ? 'WAIT' : 'HOLD';
  return { signal, score, reasons };
}
