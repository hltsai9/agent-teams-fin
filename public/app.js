// app.js — Stock Trend Dashboard frontend
// Vanilla JS, no build step. ESM module.

import { computeSignal } from '/signals.js';

// ---------------------------------------------------------------------------
// Watchlist — localStorage backed, with defaults
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'watchlist';
const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'TSLA'];

function loadWatchlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter entries to valid ticker format — guards against hand-edited localStorage
        return parsed.filter(s => typeof s === 'string' && /^[A-Z.\-]{1,10}$/.test(s));
      }
    }
  } catch (_) { /* ignore corrupt storage */ }
  return [...DEFAULT_SYMBOLS];
}

function saveWatchlist(symbols) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
}

let watchlist = loadWatchlist();

// ---------------------------------------------------------------------------
// Relative time formatting
// ---------------------------------------------------------------------------
function relativeTime(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const diff = Date.now() - d.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------
async function fetchQuotes(symbols) {
  const url = `/api/quotes?symbols=${symbols.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Quotes HTTP ${res.status}`);
  return res.json();
}

async function fetchNews(symbol) {
  const res = await fetch(`/api/news?symbol=${symbol}`);
  if (!res.ok) return { symbol, items: [] };
  return res.json();
}

// ---------------------------------------------------------------------------
// Chart rendering via lightweight-charts (loaded as global from CDN)
// ---------------------------------------------------------------------------
function renderChart(container, history) {
  // lightweight-charts exposes global LightweightCharts
  if (typeof LightweightCharts === 'undefined') return;

  const chart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight || 160,
    layout: {
      background: { color: '#0d1117' },
      textColor: '#8b949e',
    },
    grid: {
      vertLines: { color: '#21262d' },
      horzLines: { color: '#21262d' },
    },
    rightPriceScale: { borderColor: '#30363d' },
    timeScale: {
      borderColor: '#30363d',
      timeVisible: false,
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Magnet,
    },
    handleScroll: false,
    handleScale: false,
  });

  const series = chart.addAreaSeries({
    lineColor: '#58a6ff',
    topColor: 'rgba(88, 166, 255, 0.25)',
    bottomColor: 'rgba(88, 166, 255, 0)',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
  });

  if (Array.isArray(history) && history.length > 0) {
    const data = history.map(c => ({ time: c.t, value: c.c }));
    series.setData(data);
    chart.timeScale().fitContent();
  }

  // Resize chart when container changes size
  const ro = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      chart.applyOptions({ width, height: height || 160 });
      chart.timeScale().fitContent();
    }
  });
  ro.observe(container);

  return chart;
}

// ---------------------------------------------------------------------------
// Card DOM construction
// ---------------------------------------------------------------------------
function createSkeletonCard() {
  const el = document.createElement('div');
  el.className = 'skeleton-card';
  el.innerHTML = `
    <div class="skeleton skeleton-line tall short"></div>
    <div class="skeleton skeleton-line medium"></div>
    <div class="skeleton skeleton-chart"></div>
    <div class="skeleton skeleton-line short"></div>
    <div class="skeleton skeleton-line"></div>
    <div class="skeleton skeleton-line medium"></div>
  `;
  return el;
}

function createErrorCard(symbol, onRetry) {
  const el = document.createElement('div');
  el.className = 'stock-card';
  el.dataset.symbol = symbol;
  el.innerHTML = `
    <div class="card-header">
      <div class="card-symbol-wrap">
        <span class="card-symbol">${escHtml(symbol)}</span>
      </div>
      <button class="card-remove-btn" aria-label="Remove ${escHtml(symbol)}">&#x2715;</button>
    </div>
    <div class="card-error">
      <p class="card-error-msg">Failed to load data for ${escHtml(symbol)}</p>
      <button class="retry-btn">Retry</button>
    </div>
  `;
  el.querySelector('.card-remove-btn').addEventListener('click', () => removeSymbol(symbol));
  el.querySelector('.retry-btn').addEventListener('click', onRetry);
  return el;
}

function createStockCard(quote, newsItems) {
  const { symbol, price, change, changePct, history } = quote;

  // Signal computation — computeSignal from /signals.js
  const newsTitles = (newsItems || []).map(n => n.title);
  let signalResult = { signal: 'HOLD', score: 0, reasons: [] };
  try {
    signalResult = computeSignal({ history: history || [], newsTitles });
  } catch (e) {
    console.warn(`computeSignal failed for ${symbol}:`, e);
  }
  const { signal, reasons } = signalResult;

  // Price / change display
  const priceStr = typeof price === 'number' ? price.toFixed(2) : '--';
  const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : 'flat';
  const changeSign  = change > 0 ? '+' : '';
  const changeStr   = typeof change === 'number'
    ? `${changeSign}${change.toFixed(2)} (${changeSign}${changePct.toFixed(2)}%)`
    : '--';

  // Top 5 news items
  const top5 = (newsItems || []).slice(0, 5);
  const newsHtml = top5.length
    ? top5.map(n => `
        <div class="news-item">
          <a href="${escHtml(n.link)}" target="_blank" rel="noopener noreferrer">${escHtml(n.title)}</a>
          <span class="news-time">${relativeTime(n.pubDate)}</span>
        </div>
      `).join('')
    : '<span class="news-time">No recent news</span>';

  // Reasons list
  const reasonsHtml = reasons.length
    ? reasons.map(r => `<li class="signal-reason">${escHtml(r)}</li>`).join('')
    : '<li class="signal-reason">No details available</li>';

  const card = document.createElement('div');
  card.className = 'stock-card';
  card.dataset.symbol = symbol;
  card.innerHTML = `
    <div class="card-header">
      <div class="card-symbol-wrap">
        <span class="card-symbol">${escHtml(symbol)}</span>
        <span class="card-price">$${priceStr}</span>
        <span class="card-change ${changeClass}">${changeStr}</span>
      </div>
      <button class="card-remove-btn" aria-label="Remove ${escHtml(symbol)}">&#x2715;</button>
    </div>

    <div class="card-chart" aria-label="${escHtml(symbol)} price chart"></div>

    <div class="card-body">
      <div class="signal-wrap">
        <button class="signal-badge" data-signal="${escHtml(signal)}" aria-expanded="false" aria-label="Signal: ${escHtml(signal)}, click to expand reasons">
          ${escHtml(signal)}
          <i class="signal-toggle-icon" aria-hidden="true">&#9660;</i>
        </button>
        <ul class="signal-reasons" role="list">
          ${reasonsHtml}
        </ul>
      </div>

      <div class="news-list">
        <p class="news-label">Latest News</p>
        ${newsHtml}
      </div>
    </div>
  `;

  // Chart
  const chartEl = card.querySelector('.card-chart');
  // Defer chart init until element is in DOM (ResizeObserver needs layout)
  requestAnimationFrame(() => renderChart(chartEl, history || []));

  // Remove button
  card.querySelector('.card-remove-btn').addEventListener('click', () => removeSymbol(symbol));

  // Signal expand/collapse
  const badge = card.querySelector('.signal-badge');
  const reasonsEl = card.querySelector('.signal-reasons');
  const icon = card.querySelector('.signal-toggle-icon');
  badge.addEventListener('click', () => {
    const open = reasonsEl.classList.toggle('open');
    badge.setAttribute('aria-expanded', String(open));
    icon.style.transform = open ? 'rotate(180deg)' : '';
  });

  return card;
}

// HTML escape helper
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Rendering orchestration
// ---------------------------------------------------------------------------
const grid = document.getElementById('cards-grid');

// Map symbol → { skeletonEl, cardEl } for targeted updates
const cardMap = new Map();

function renderSkeletons(symbols) {
  grid.innerHTML = '';
  cardMap.clear();
  for (const sym of symbols) {
    const skel = createSkeletonCard();
    grid.appendChild(skel);
    cardMap.set(sym, { skeletonEl: skel, cardEl: null });
  }
}

function replaceWithCard(symbol, cardEl) {
  const entry = cardMap.get(symbol);
  if (!entry) return;
  if (entry.skeletonEl && entry.skeletonEl.parentNode === grid) {
    grid.replaceChild(cardEl, entry.skeletonEl);
  }
  cardMap.set(symbol, { skeletonEl: null, cardEl });
}

function replaceWithError(symbol, onRetry) {
  const errEl = createErrorCard(symbol, onRetry);
  const entry = cardMap.get(symbol);
  if (!entry) return;
  const target = entry.skeletonEl || entry.cardEl;
  if (target && target.parentNode === grid) {
    grid.replaceChild(errEl, target);
  }
  cardMap.set(symbol, { skeletonEl: null, cardEl: errEl });
}

// ---------------------------------------------------------------------------
// Main load routine
// ---------------------------------------------------------------------------
async function loadData(symbols) {
  if (symbols.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted);padding:24px;">Your watchlist is empty. Add a symbol above.</p>';
    return;
  }

  renderSkeletons(symbols);

  // Fetch quotes for all symbols at once
  let quotesData;
  try {
    quotesData = await fetchQuotes(symbols);
  } catch (err) {
    // Full fetch failure — show error on all cards
    for (const sym of symbols) {
      replaceWithError(sym, () => loadData(loadWatchlist()));
    }
    return;
  }

  const quoteMap = new Map((quotesData.quotes || []).map(q => [q.symbol, q]));

  // Fetch news for each symbol in parallel
  const newsPromises = symbols.map(sym =>
    fetchNews(sym).then(data => ({ sym, items: data.items || [] })).catch(() => ({ sym, items: [] }))
  );
  const newsResults = await Promise.all(newsPromises);
  const newsMap = new Map(newsResults.map(r => [r.sym, r.items]));

  // Render each card
  for (const sym of symbols) {
    const quote = quoteMap.get(sym);
    if (!quote) {
      // Symbol had an error in quotes response or not found
      replaceWithError(sym, () => loadData(loadWatchlist()));
      continue;
    }
    const newsItems = newsMap.get(sym) || [];
    const card = createStockCard(quote, newsItems);
    replaceWithCard(sym, card);
  }
}

// ---------------------------------------------------------------------------
// Watchlist mutations
// ---------------------------------------------------------------------------
function addSymbol(raw) {
  const sym = raw.trim().toUpperCase().replace(/[^A-Z.\-]/g, '');
  if (!sym) return;
  if (watchlist.includes(sym)) return;
  watchlist = [...watchlist, sym];
  saveWatchlist(watchlist);
  // Append a skeleton and load just the new symbol's data incrementally
  loadData(watchlist);
}

function removeSymbol(sym) {
  watchlist = watchlist.filter(s => s !== sym);
  saveWatchlist(watchlist);
  // Remove the card from the grid directly for responsiveness
  const entry = cardMap.get(sym);
  if (entry) {
    const el = entry.skeletonEl || entry.cardEl;
    if (el && el.parentNode === grid) grid.removeChild(el);
    cardMap.delete(sym);
  }
  if (watchlist.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted);padding:24px;">Your watchlist is empty. Add a symbol above.</p>';
  }
}

// ---------------------------------------------------------------------------
// Input event wiring
// ---------------------------------------------------------------------------
const symbolInput = document.getElementById('symbol-input');
const addBtn      = document.getElementById('add-btn');

addBtn.addEventListener('click', () => {
  addSymbol(symbolInput.value);
  symbolInput.value = '';
  symbolInput.focus();
});

symbolInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    addSymbol(symbolInput.value);
    symbolInput.value = '';
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
loadData(watchlist);
