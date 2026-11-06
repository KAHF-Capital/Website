# Kimi by KAHF Capital — Phase 0 Exploration & Architecture Plan

This document maps the existing KAHF Capital codebase and lists every internal API and backend module Kimi consumes. It records the gaps between the prompt's requirements and the current infrastructure (the dark pool and backtesting backends were not modified), and gives Kimi's data model and build status.

> **Status:** approved and built. Sections 3–6 were updated after the build to match the implementation and the gaps found along the way. Operations, setup and tuning are in [README.md](./README.md).

---

## 1. Codebase Map

| Area | Current Implementation in Repo |
|---|---|
| **Framework & Routing** | **Next.js 14** using the **Pages Router**: routes in `pages/`, page components in `src/pages/`, shared components in `src/components/`. JavaScript, with ESM and CommonJS mixed in `lib/`. |
| **UI & Charts** | **Tailwind CSS 3.4**, `lucide-react` icons, `framer-motion`. Charts are custom dependency-free SVG components. Kimi follows the same approach (`src/components/kimi/charts.jsx`). |
| **Auth & Roles** | **Firebase Auth** client SDK (`lib/firebase.js`, `src/context/AuthContext.jsx`) plus the **Firebase Admin SDK** (`lib/firebase-admin.js`, `verifyIdToken`) on API routes.<ul><li>**Plan:** `users/{uid}.subscription.status` (`active` or `trialing` = Pro, via `lib/subscription-access.js`, synced by the Stripe webhook).</li><li>**Admin:** a verified ID token whose email is in `ADMIN_EMAILS`, or `Bearer ${ADMIN_SECRET}` for server-to-server calls.</li></ul> |
| **Database & Storage** | **Cloud Firestore** via `getFirestoreAdmin()`: schemaless, with no ORM or migration runner. Existing collections: `users`, `pending_subscriptions`, `track_record`, `ai_usage`.<br>**Vercel Blob** holds the daily dark pool JSON, gzipped history shards and the published signal reads (`reads/track-record-reads.json`, `reads/top-reads.json`). |
| **Job / Queue System** | **None installed.** No BullMQ, no Redis client, no `crons` in `vercel.json`. Daily ingestion and signal scoring run from the CLI (`node process-csv.js` → `scripts/refresh-track-record.js` → `scripts/build-scanner-history-index.js`). |
| **Existing Analytics** | **PostHog** client wrapper in `lib/analytics.js`. |
| **Existing LLM Usage** | **Anthropic SDK** in `pages/api/kahf-ai-chat.js` (`claude-sonnet-5-5`), connected to the internal MCP server at `POST /api/mcp`. Monthly quotas live in Firestore via `lib/ai-usage.js`. |

---

## 2. Internal APIs & Backend Modules Kimi Consumes

Kimi does not modify the dark pool or backtesting backends and does **no signal detection of its own**.

### A. Backend signal output

#### 1. Scored reads (the primary signal output)
- **Where signals are emitted:** `scripts/refresh-track-record.js`, run at the end of `process-csv.js`, scores the latest processed session with `scripts/build-top-reads.js`. It writes:
  - `reads/track-record-reads.json`: every published read, as `{ generated_at, since, reads }`
  - `reads/top-reads.json`: the latest session's reads only, as `{ generated_at, signal_date, reads }`
  Both go to Vercel Blob, with bundled copies in the repo root as a fallback.
- **Delivery:** files that must be **polled**. There is no push stream or webhook. The site also serves them via `GET /api/top-reads`, `GET /api/wins` and the MCP tool `get_track_record`.
- **Signal ID:** the backend keys each read by `${ticker}__${date}` (`readKey` in `refresh-track-record.js`). Kimi uses this as `backend_signal_id`.
- **Payload fields:**
  ```json
  {
    "date": "2026-10-22",
    "ticker": "CSX",
    "volume_ratio": 3.02,
    "dark_pool_value": 630282815.82,
    "dark_pool_avg_price": 51.57,
    "structure": "straddle",
    "direction": "bullish",
    "strike": 52,
    "expiration": "2026-11-20",
    "dte": 29,
    "entry_premium": 2.69,
    "asof_hit_rate": 64,
    "asof_samples": 25,
    "contracts": ["O:CSX261120C00052000", "O:CSX261120P00052000"],
    "found_at": "2026-10-22T21:00:00.000Z"
  }
  ```
- **Live-marked fields** (`lib/reads-live.js` `markRead()`): `structureLabel`, `status` (`open` / `settled` / `closed`), `currentPremium`, `returnPct`, `exitDate`, `exitReason`, `settleClose`.
- **Publish time and latency:** `found_at` is the publish time, stamped by `refresh-track-record.js` when it scores the latest session. Signals are session aggregates, published once per session, typically about 5 PM ET. There is no intraday print stream.
- **Revisions and retractions:**
  - Each refresh drops reads whose ticker is in `EXCLUDED_TICKERS` (`lib/read-filters.js`), that fail `isPublishedOnSignalSession(date, found_at)`, or whose hit rate is outside the band.
  - `--rebuild` re-prices history but keeps the original `found_at` stamps.
  - Kimi treats a published signal that later disappears from the history file, or that fails those same backend filters, as **retracted**.
- **Parameter versioning:** `track-record-reads.json` sometimes carries a top-level `method` string (e.g. `"walk-forward: 3x vs previous 7 calendar days, last 25 one-month iterations, prices on or before the signal day"`). Kimi stores it as `backend_param_version` when present. `refresh-track-record.js` writes the file without it, so after a normal refresh the version is `null` (see gaps).

#### 2. Unscored daily scanner signals (context for questions)
- `getScannerSnapshot()` (`lib/scanner-snapshot.js`) and the MCP tool `get_scanner_signals`. Fields: `{ ticker, darkPoolVolume, darkPoolValue, darkPoolAvgPrice, darkPoolTradeCount, avg7DayDarkPoolVolume, volumeRatio, currentStockPrice }`.

### B. Dark pool prints

| Endpoint / Function | Auth | Request | Response | Stream vs. Poll |
|---|---|---|---|---|
| `GET /api/darkpool-trades` (`getScannerSnapshot()`) | public | `?minVolume=0&minPrice=0` | `{ date, total_tickers, tickers: [{ ticker, total_volume, trade_count, avg_price, total_value, min_price, max_price, avg_7day_volume, volume_ratio }] }` | Poll (60s cache) |
| `GET /api/dark-pool-history` (`getTickerHistory(ticker, { asOf })`) | public | `?ticker=NVDA&asOf=YYYY-MM-DD` | `{ ticker, data: [{ date, total_volume, trade_count, avg_price, total_value, avg_7day_volume, volume_ratio }], as_of, lookahead: false }` | Poll (5m cache) |

### C. Prices and quotes

| Function | Notes |
|---|---|
| `getCurrentStockPrice(ticker)` (`lib/polygon-data-service.js`) | Polygon **previous-day close** |
| `getHistoricalStockData(ticker, from, to)` | Daily OHLCV bars; Kimi uses them for T+1 / T+5 forward returns and backtest windows |
| Polygon `/v3/reference/tickers/{ticker}` | `sic_code` / `sic_description` → sector for watchlist matching (cached in `kimi_ticker_meta`) |

### D. Backtesting

| Function | Request | Response | Mode |
|---|---|---|---|
| `runHistoricalAnalysis(config)` (`lib/options-analysis-service.js`) | `{ ticker, strategy: 'call' \| 'put' \| 'straddle', strikePrice, premium, daysToExpiration, asOfDate? }` | `{ totalSamples, totalProfitable, profitableRate, avgMove, maxMove, minMove, breakevens, historyAsOf, lookahead: false, dataQuality, ... }` | Synchronous, ~1–8s |
| `getOptionsQuote(ticker, expiration, strategy)` | live ATM strike and premium | `{ strike, premium, callPrice, putPrice, ... }` | Synchronous |
| `calculatePriceMovements` / `calculateOverlappingMovements` | historical N-day windows | per-window price moves | Synchronous |

No async job ids, Sharpe, drawdown or per-trade P&L are returned (see gaps).

---

## 3. Kimi tools → internal APIs (as built)

Every tool receives `user_id` from the server session. The model never supplies it. Every call is logged to `kimi_tool_calls`.

| Tool | Maps to | Notes |
|---|---|---|
| `get_recent_dark_pool_prints({ ticker?, since?, min_notional? })` | `getTickerHistory` (ticker) or `getScannerSnapshot` (market-wide) | Session aggregates, not individual prints. 60s shared cache. |
| `get_alert({ alert_id })` | `kimi_alerts` + delivery ownership check, enriched with `markRead()` and ticker history | "Not found" if the user never received it |
| `list_backtest_structures()` | `call`, `put`, `straddle`, with the config schema `runHistoricalAnalysis` accepts | Never invents fields |
| `run_backtest({ config: { ticker?, structures?, days_to_expiration?, as_of_date?, rank_by?, alert_id? } })` | Creates a `kimi_backtests` job; the runner calls `getOptionsQuote` + `runHistoricalAnalysis` per structure | Async: returns a job id and estimate immediately. With `alert_id`, the ticker, holding window and history cutoff come from the backend signal. |
| `get_backtest_result({ job_id })` | `kimi_backtests` (owner only) | Status, config, per-structure stats, link |
| `compare_backtests({ job_ids, rank_by })` | Owned jobs, ranked by Sharpe (default), win rate, average return or drawdown | Top 3 + link |
| `get_preferences()` / `update_preferences({...})` | `kimi_profiles/{user_id}.preferences` | Validated against config bounds; emits `prefs_updated` |
| `get_stock_quote({ ticker })` | `getCurrentStockPrice` | Previous close, labeled as such |

---

## 4. Gaps found and how Kimi handles them

Nothing below was patched in the backend. Each item is handled inside Kimi or left visible.

1. **No intraday print time, share count or price reaction in the signal payload.** The prompt's example alert mentions "1.2M sh at 10:42, price +0.08% in 30 min". The backend publishes session aggregates without those fields. The template drops those clauses, and Kimi never computes them.
2. **The backtest API can't condition entries on past signals.** `runHistoricalAnalysis` tests every N-day window in history, not only windows that followed a similar dark pool signal. Kimi labels results as "all N-day windows since YEAR". For alert-initiated backtests it caps history at the signal date and shows the signal's own track record (from `markRead`) separately.
3. **No Sharpe, drawdown, average return or per-trade list from the backtest API.** Kimi derives them from the same windows the backend uses (via `calculatePriceMovements` / `calculateOverlappingMovements` and the backend's own filter). It shows them only if its trade and win counts reproduce the backend's `totalSamples` and `totalProfitable` (`derived_metrics_verified`). Otherwise it shows only the backend's numbers.
4. **The backtest API is synchronous.** Kimi wraps each run in a `kimi_backtests` job (queued → running → completed/failed), sends the acknowledgement first, runs in the background, and times out stuck jobs after 10 minutes.
5. **Parameter versioning is inconsistent.** `method` appears only when the file was written by the walk-forward builder. `refresh-track-record.js` drops it. Kimi stores `backend_param_version = method ?? null`. A stable version would need the backend to write it on every refresh.
6. **No push stream.** Kimi polls the published files from the tick (every 5 minutes) and dedupes by signal id.
7. **Prints are session aggregates.** "Recent prints" means per-session totals (notional, average price, trade count, volume ratio), not individual trades. The tool description tells the model so.
8. **The quote tool returns the previous close.** That's what `getCurrentStockPrice` provides. The tool description says it isn't a real-time quote.
9. **No sector on print rows.** Sector watchlists use Polygon's SIC code, mapped to broad sectors and cached in `kimi_ticker_meta`.
10. **No job queue.** Kimi uses a durable Firestore queue (`kimi_jobs`, with leases and retries), plus optional BullMQ when `REDIS_URL` is set.
11. **Signals publish after the close.** Users with "market hours only" currently receive nothing, because `found_at` is about 5 PM ET. This is visible in the replay tool. The README covers it under delivery tuning.
12. **Data note:** the scanner history shows identical rows for some tickers on Oct 23 and Oct 28, 2026 (e.g. NVDA, CSX). Kimi displays the backend's data as-is. Worth checking in the ingest.

---

## 5. Data model (Firestore, as built)

All collections are prefixed `kimi_`. Development uses a local JSON file with the same shapes; tests use memory.

| Collection | Key | Contents |
|---|---|---|
| `kimi_profiles` | user id | Encrypted phone, HMAC hash and mask; verification state; consent (version, text, time, IP, user agent); opt-out / pause; timezone; preferences (watchlist, sectors, muted, min notional, quiet hours, market-hours-only, caps, digest); plan; last alert |
| `kimi_phones` | phone hash | Owning user (one number, one account); opt-out state; unknown-sender reply cooldown |
| `kimi_conversations` | user id | One shared thread across iMessage, SMS and web: rolling summary, counts, flags |
| `kimi_messages` | message id | Immutable log: direction, channel, provider, provider message id, body, intent, related alert/backtest, tokens, cost, latency, `retain_until` |
| `kimi_alerts` | backend signal id | Unmodified payload, `backend_param_version`, `signal_at`, `received_at`, status (`active` / `stale` / `retracted`), forward returns |
| `kimi_alert_deliveries` | `alert__user` | `sent` / `delivered` / `suppressed` / `failed` / `queued_digest`, reason code, channel, timings, replies, clicks, backtests, mutes and opt-outs within 24h |
| `kimi_backtests` | job id | Owner, source (`alert` / `free_form` / `web`), config, status, per-structure results, ranking, runtime, error |
| `kimi_tool_calls` | id | Tool, arguments, latency, success, error |
| `kimi_links` | short code | Target, owner, alert, click counts |
| `kimi_events` | id | Every analytics event in the prompt's list, plus pipeline events |
| `kimi_daily_rollups` | day | Per-day metrics keyed `channel\|plan\|ticker` (with `*` totals) |
| `kimi_audit_log` | id | Admin transcript views, exports, switch changes |
| `kimi_system` | `state` | Kill switch and dry-run overrides, last tick / rollup |
| `kimi_jobs` | id | Durable inbound queue |
| `kimi_usage` | day + user | Token, cost and message counters for caps and the cost dashboard |
| `kimi_rate_limits` | window key | Fixed-window counters |
| `kimi_ticker_meta` | ticker | Cached sector lookups |

---

## 6. Build status

| Phase | Delivered |
|---|---|
| 1. Config, security, store, messaging | `lib/kimi/kimi.config.js`, `crypto.js`, `runtime.js`, `db.js`, `store.js`, `messaging/` (Sendblue, Twilio, Mock), `keywords.js`, webhooks, status callbacks, short links |
| 2. Agent, tools, memory, backtests | `llm.js`, `agent.js`, `tools.js`, `backtests.js`, `backend.js`, `inbound.js`, `queue.js`, `spend.js` |
| 3. Alert engine and replay | `alert-engine.js`, `jobs.js`, `/api/kimi/jobs/tick`, `/api/kimi/jobs/rollup`, `scripts/kimi-replay.js` |
| 4. Website | `/kimi` (onboarding with verification code, consent and QR; preferences; alert history; web chat), `/kimi/alerts/[id]`, `/kimi/backtests/[id]` |
| 5. Admin dashboard and seed | `/admin/kimi` (7 tabs, filters, deltas, CSV, kill switch), `/admin/kimi/users/[id]` (audit-logged transcript, export), `scripts/kimi-seed.js` |
| 6. Tests and docs | `tests/kimi/*.test.mjs`, `.env.example`, `docs/kimi/README.md` |
