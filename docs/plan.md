# Stock Trend Website — Agent Team Build Plan

## Context

The user wants a website, viewable on laptop **and** phone, that shows price trends for US stocks they're interested in, combines them with the latest news, and suggests when to buy (Buy / Hold / Wait signals with reasoning + a not-financial-advice disclaimer).

Decisions confirmed with the user:
- **Markets:** US stocks (editable watchlist, sensible defaults like AAPL/MSFT/NVDA/GOOGL/TSLA)
- **Hosting:** Deploy to **Vercel free tier** — static responsive frontend + serverless functions
- **Data:** Zero-signup sources — Yahoo Finance unofficial API (quotes/history) + Yahoo Finance RSS (news), proxied through serverless functions to avoid CORS
- **Suggestions:** Technical indicators (RSI-14, SMA-20/50 crossover) + keyword-based news sentiment → simple signal with reasons
- **Build method:** An **agent team of 5 teammates** (user explicitly requested this)

The project directory is a fresh greenfield repo (`agent_teams_demo1/`), now initialized as git with remote `origin` → `github.com/hltsai9/agent-teams-fin` (main branch pushed).

## Architecture

```
Vercel (free hobby tier)
├─ public/                     ← static responsive frontend
│   ├─ index.html              dashboard: watchlist, charts, news, signal cards
│   ├─ app.js                  fetches /api/*, renders UI, manages watchlist (localStorage)
│   ├─ style.css               mobile-first responsive (CSS grid, media queries)
│   └─ chart rendering         lightweight-charts (CDN) for candlestick/line trends
├─ api/
│   ├─ quotes.js               GET /api/quotes?symbols=AAPL,MSFT
│   │                          → proxies query1.finance.yahoo.com chart API
│   │                          → { quotes: [{ symbol, price, change, changePct,
│   │                                          history: [{t,o,h,l,c}] (6mo daily) }] }
│   └─ news.js                 GET /api/news?symbol=AAPL
│                              → proxies Yahoo Finance RSS, parses XML
│                              → { items: [{ title, link, pubDate, source }] }
├─ lib/
│   ├─ signals.js              pure functions: rsi(closes), sma(closes, n),
│   │                          sentiment(newsTitles), computeSignal({history, news})
│   │                          → { signal: 'BUY'|'HOLD'|'WAIT', score, reasons: [] }
│   └─ sentiment-lexicon.js    pos/neg keyword lists for headline scoring
├─ test/                       Vitest unit tests (signals math, RSS parsing, API shape)
├─ package.json                vitest only dev-dep; no build step (vanilla JS)
└─ vercel.json                 routes config
```

**Signal logic** (pure, testable, runs in the browser using data from the two APIs):
- RSI < 30 → oversold (+buy points); RSI > 70 → overbought (+wait points)
- SMA20 crossing above SMA50 → golden cross (+buy); below → death cross (+wait)
- News sentiment: net positive/negative keyword score over latest ~10 headlines
- Weighted total → BUY / HOLD / WAIT, displayed with the contributing reasons and a clear "not financial advice" disclaimer.

## Agent Team Structure (5 teammates)

Create a team via **TeamCreate** (name: `stock-site`). I act as lead/coordinator — I create tasks with **TaskCreate**, set dependencies, spawn 5 teammates, review their output, and integrate. Teammates and their assignments:

| Teammate | Role | Owns |
|---|---|---|
| `api-quotes` | Backend | `api/quotes.js` — Yahoo Finance chart proxy, symbol validation, caching headers |
| `api-news` | Backend | `api/news.js` — RSS fetch + XML parsing (no deps, regex/DOMParser-free server-safe parse) |
| `signals` | Quant | `lib/signals.js` + `lib/sentiment-lexicon.js` + their unit tests (TDD) |
| `frontend` | UI | `public/*` — mobile-first responsive dashboard, lightweight-charts, watchlist editor, signal cards, news list |
| `qa-deploy` | QA/DevOps | Vitest setup, integration tests against local `vercel dev`, `vercel.json`, README + deploy instructions |

**Parallelization:** the four file-level interface contracts above (API response shapes, `computeSignal` signature) are fixed up front in each teammate's task description, so `api-quotes`, `api-news`, `signals`, and `frontend` work fully in parallel against mocked contracts. `qa-deploy` sets up tooling in parallel, then runs integration once the others land.

### Agent definition files (one per teammate)

Create a markdown agent definition for each teammate in **`.claude/agents/`** (Claude Code's discoverable agents folder, so each file actually loads as a custom agent type; if you'd rather have them in a plain `agents/` dir for documentation, say so at review):

- `.claude/agents/api-quotes.md` — backend specialist; Yahoo Finance proxy conventions, error/rate-limit handling, response contract
- `.claude/agents/api-news.md` — backend specialist; RSS/XML parsing without heavy deps, response contract
- `.claude/agents/quant.md` — signals engineer; **skills loadout: superpowers:test-driven-development (write failing tests for RSI/SMA/sentiment first), superpowers:verification-before-completion (validate indicator outputs against published reference values before claiming done), superpowers:systematic-debugging (when a signal disagrees with expectations)**. Includes reference formulas (Wilder's RSI-14, SMA) and known test vectors in its instructions.
- `.claude/agents/frontend.md` — UI specialist; mobile-first responsive rules, lightweight-charts usage, accessibility basics
- `.claude/agents/qa-deploy.md` — QA/DevOps; vitest setup, integration verification checklist, vercel.json + deploy steps

Each file uses standard agent frontmatter (`name`, `description`, **`model: sonnet`** — all five teammates run on Sonnet) followed by role instructions and its file-ownership + interface contracts. Teammates are then spawned with their matching `subagent_type`.

(No finance-specific skills are installed locally — the superpowers trio above is the best available fit for the Quant role; its agent.md compensates with embedded domain reference material.)

**Task flow:**
0. Lead copies this plan into the repo as `docs/plan.md` and commits it (first action after approval)
1. Lead scaffolds repo skeleton (package.json, dir structure, contracts doc, `.claude/agents/*.md`) — tiny, done before spawning
2. Tasks 1–4 (quotes, news, signals, frontend) run in parallel, one per teammate
3. Task 5 (qa-deploy): test harness in parallel; integration verification blocked on 1–4
4. Lead reviews each teammate's work as it completes, requests fixes via SendMessage
5. Lead does final end-to-end verification and prepares deployment

## Verification

- `npx vitest run` — unit tests for RSI/SMA/sentiment math and parsers pass
- `npx vercel dev` (or `node` local harness) — hit `/api/quotes?symbols=AAPL` and `/api/news?symbol=AAPL`, confirm real data comes back with the agreed shapes
- Open the local site in a browser: charts render, signals show with reasons, watchlist add/remove persists across reload
- Responsive check: viewport at 375px (phone) and 1280px (laptop) — layout adapts (charts stack on mobile)
- **Deployment:** needs the user's Vercel account. I'll prepare everything; the user runs `! npx vercel login` in-session when ready, then I deploy with `npx vercel --prod` and share the URL to open on their phone.

## Notes / Risks

- Yahoo's unofficial API occasionally rate-limits or changes; quotes function includes a friendly error payload and the frontend shows a retry state.
- Suggestions are heuristic, clearly labeled "not financial advice."
- No API keys or secrets anywhere; safe to host publicly.
