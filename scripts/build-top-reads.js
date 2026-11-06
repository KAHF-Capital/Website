/**
 * build-top-reads.js
 *
 * Generates the "Top reads — last N days" set for the homepage live-performance
 * strip. For each recent dark pool signal that clears the KAHF Read gates, we:
 *   1. Identify the ATM ~30 DTE call + put on the signal date.
 *   2. Record entry premiums + the option contract tickers (so the live
 *      endpoint can mark them to market later).
 *   3. Pick the structure (call/put/straddle) with the best STEP-FORWARD
 *      historical hit rate (history capped at the signal date — no lookahead).
 *
 * Output: top-reads.json  (consumed by /api/top-reads, which adds live prices).
 *
 * Reads dark pool data from local data/processed/*.json (source of truth before
 * blob upload). Usage:
 *   node scripts/build-top-reads.js [--days 30] [--max 8] [--min-hit-rate 50]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

(function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
})();

const { analyzeOptionsProfitability } = await import(
  '../lib/options-analysis-service.js'
);
const { getHistoricalStockData, calculatePriceMovements } = await import('../lib/polygon-data-service.js');
const { EXCLUDED_TICKERS, volatilityRegimeCollapsed, directionFromSignal, DIRECTION_DEFAULTS } = await import('../lib/read-filters.js');

const API_BASE = 'https://api.massive.com';
const KEY = process.env.POLYGON_API_KEY;
if (!KEY) {
  console.error('Missing POLYGON_API_KEY');
  process.exit(1);
}

export const DEFAULT_OPTS = {
  days: 30, since: null, out: 'top-reads', max: 8,
  minHitRate: 50,
  // Above this the "edge" is almost always an illiquid-pricing artifact (tiny
  // stale premium -> implausible breakeven). Was 90; the three worst YTD losers
  // all carried 78-88% published edges. Now a per-leg disqualifier, not a veto.
  maxHitRate: 75,
  // Direction-confirmed puts qualify at a lower floor: put hit rates are
  // structurally depressed by 3y of upward drift, so a 45-50% put edge WITH
  // bearish dark-pool confirmation is a real signal (backtested YTD).
  putHitRateFloor: DIRECTION_DEFAULTS.putHitRateFloor,
  // A straddle breakeven under ±4% means near-zero premium = stale/no-bid
  // pricing, not cheap vol. (GSAT/APGE/CRNX all slipped in at ±2%.)
  straddleImpliedFloor: 0.04,
  minSamples: 25, minVolRatio: 3.0, minValue: 250_000_000, minPrice: 50, maxPrice: 5000, minHistoryDays: 400, targetDte: 30, averageDays: 7,
  // 3x versus the previous 7 calendar days, not including the signal day.
  // The scanner page still uses its own inclusive window.
  volumeBaseline: 'prior'
};

// One iteration is one month of trading sessions. The hit rate is that test
// repeated on the 25 most recent iterations that end on or before the signal day.
const HIT_RATE_ITERATIONS = 25;
const MONTH_TRADING_DAYS = 21;

// EXCLUDED_TICKERS (manual override) + the automated deal/dead-vol veto both
// live in lib/read-filters.js so the serving layer can share them. Re-exported
// here for back-compat with existing importers (e.g. refresh-track-record.js).
export { EXCLUDED_TICKERS };

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { ...DEFAULT_OPTS };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--days') o.days = parseInt(a[++i], 10);
    else if (a[i] === '--since') o.since = a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--max') o.max = parseInt(a[++i], 10);
    else if (a[i] === '--min-hit-rate') o.minHitRate = parseFloat(a[++i]);
  }
  return o;
}

async function fetchJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 1500 * (i + 1))); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const dayStr = (d) => d.toISOString().slice(0, 10);
function minusDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return dayStr(d);
}

async function getStockCloseOnDate(ticker, date) {
  const data = await fetchJson(`${API_BASE}/v2/aggs/ticker/${ticker}/range/1/day/${date}/${date}?adjusted=true&apiKey=${KEY}`);
  return data.results?.[0]?.c ?? null;
}

// Exclude ETFs/ETNs/funds — we want single-name institutional setups.
const NON_STOCK_TYPES = new Set(['ETF', 'ETN', 'ETV', 'FUND', 'INDEX']);
// Cache classifications — the same ticker recurs across many signal days during a
// multi-day back-scan, so this avoids re-hitting the reference endpoint per day.
const _isStockCache = new Map();
async function isStock(ticker) {
  if (_isStockCache.has(ticker)) return _isStockCache.get(ticker);
  let result;
  try {
    const data = await fetchJson(`${API_BASE}/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${KEY}`);
    const type = data.results?.type;
    result = !NON_STOCK_TYPES.has(type);
  } catch {
    result = true; // unknown — don't over-filter
  }
  _isStockCache.set(ticker, result);
  return result;
}

async function listContractsInRange(ticker, fromDate, toDate, asOf) {
  const params = new URLSearchParams({
    underlying_ticker: ticker,
    'expiration_date.gte': fromDate,
    'expiration_date.lte': toDate,
    limit: '1000',
    apiKey: KEY
  });
  if (asOf) params.set('as_of', asOf);
  const data = await fetchJson(`${API_BASE}/v3/reference/options/contracts?${params}`);
  return data.results || [];
}

async function getOptionAggWithFallback(optionsTicker, date, maxLookback = 5) {
  let cursor = new Date(`${date}T12:00:00Z`);
  for (let i = 0; i <= maxLookback; i++) {
    const stamp = dayStr(cursor);
    try {
      const data = await fetchJson(`${API_BASE}/v2/aggs/ticker/${optionsTicker}/range/1/day/${stamp}/${stamp}?adjusted=true&apiKey=${KEY}`);
      const bar = data.results?.[0];
      if (bar && (bar.vw ?? bar.c ?? 0) > 0) return { price: bar.vw ?? bar.c };
    } catch {}
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return null;
}

// --- Load recent signals from local processed files ------------------------
// Each file is parsed once and reduced to per-ticker volume. The full JSON is
// not kept (a year of tape is hundreds of MB).
function loadCompactDays(fromDate) {
  const dir = path.join(ROOT, 'data', 'processed');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) >= fromDate).sort();
  const days = [];
  for (const file of files) {
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); } catch { continue; }
    const tickers = new Map();
    for (const t of data.tickers || []) {
      tickers.set(t.ticker, {
        v: Number(t.total_volume) || 0,
        val: Number(t.total_value) || 0,
        px: Number(t.avg_price) || 0,
        n: Number(t.trade_count) || 0
      });
    }
    days.push({ date: file.slice(0, 10), tickers });
  }
  return days;
}

function listProcessedDates() {
  const dir = path.join(ROOT, 'data', 'processed');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
}

function loadLocalSignals(opts) {
  const allDates = listProcessedDates();
  if (allDates.length === 0) return [];
  const latest = allDates[allDates.length - 1];
  const since = opts.since || minusDays(latest, opts.days);
  const prior = opts.volumeBaseline !== 'inclusive';
  const lookback = opts.averageDays || 7;
  const neededFrom = minusDays(since, lookback + 1);
  const days = loadCompactDays(neededFrom);
  if (days.length === 0) return [];
  const usable = days;
  const byDate = new Map(usable.map((d) => [d.date, d]));
  const dates = usable.map((d) => d.date);

  const rows = [];
  for (const day of dates) {
    if (day < since) continue;
    const start = minusDays(day, prior ? lookback : lookback - 1);
    const sums = new Map();
    const counts = new Map();
    for (const d of dates) {
      if (d < start) continue;
      if (prior ? d >= day : d > day) break;
      const bucket = byDate.get(d);
      for (const [ticker, t] of bucket.tickers) {
        sums.set(ticker, (sums.get(ticker) || 0) + t.v);
        counts.set(ticker, (counts.get(ticker) || 0) + 1);
      }
    }
    const cur = byDate.get(day);
    for (const [ticker, t] of cur.tickers) {
      const count = counts.get(ticker) || 0;
      const avg = count > 0 ? sums.get(ticker) / count : 0;
      if (avg <= 0) continue;
      const ratio = t.v / avg;
      if (ratio < opts.minVolRatio) continue;
      if ((t.val || 0) < opts.minValue) continue;
      if ((t.px || 0) < opts.minPrice || (t.px || 0) > opts.maxPrice) continue;
      rows.push({
        date: day, ticker, avg_price: t.px,
        total_value: t.val, total_volume: t.v,
        trade_count: t.n, volume_ratio: Number(ratio.toFixed(2))
      });
    }
  }
  // One candidate per (ticker, day): every day a ticker clears the volume-ratio
  // gate is its own signal. Newest first, strongest-ratio first within a day.
  return rows.sort((a, b) =>
    a.date === b.date ? b.volume_ratio - a.volume_ratio : a.date < b.date ? 1 : -1
  );
}

// --- Per-signal: find ATM ~30 DTE contracts + entry premiums ---------------
async function priceEntry(ticker, signalDate, targetDte) {
  const signalClose = await getStockCloseOnDate(ticker, signalDate);
  if (!signalClose) throw new Error('no signal-date close');

  const target = new Date(`${signalDate}T12:00:00Z`);
  target.setUTCDate(target.getUTCDate() + targetDte);
  const winFrom = minusDays(dayStr(target), 20);
  const winTo = (() => { const d = new Date(target); d.setUTCDate(d.getUTCDate() + 20); return dayStr(d); })();

  const contracts = await listContractsInRange(ticker, winFrom, winTo, signalDate);
  if (contracts.length === 0) throw new Error('no contracts');

  const byExp = {};
  for (const c of contracts) (byExp[c.expiration_date] ||= []).push(c);
  let bestExp = null, bestDiff = Infinity;
  for (const exp of Object.keys(byExp)) {
    const diff = Math.abs(new Date(`${exp}T12:00:00Z`) - target);
    if (diff < bestDiff) { bestDiff = diff; bestExp = exp; }
  }
  const exp = byExp[bestExp];
  let callC = null, putC = null, cd = Infinity, pd = Infinity;
  for (const c of exp) {
    const diff = Math.abs(c.strike_price - signalClose);
    if (c.contract_type === 'call' && diff < cd) { cd = diff; callC = c; }
    else if (c.contract_type === 'put' && diff < pd) { pd = diff; putC = c; }
  }
  if (!callC || !putC) throw new Error('missing ATM call/put');

  const [cr, pr] = await Promise.all([
    getOptionAggWithFallback(callC.ticker, signalDate),
    getOptionAggWithFallback(putC.ticker, signalDate)
  ]);
  if (!cr || !pr) throw new Error('no entry premium');

  return {
    signalClose,
    strike: callC.strike_price,
    expiration: bestExp,
    callTicker: callC.ticker,
    putTicker: putC.ticker,
    callPrice: Number(cr.price.toFixed(2)),
    putPrice: Number(pr.price.toFixed(2)),
    dte: Math.round((new Date(`${bestExp}T12:00:00Z`) - new Date(`${signalDate}T12:00:00Z`)) / 86400000)
  };
}

// One Polygon pull per ticker, then sliced to the signal date. Later bars are
// never scored. Adjusted closes make a past return the same either way.
const _histCache = new Map();
async function historyAsOf(ticker, signalDate, need) {
  // Look back from the signal date, not from today. A window anchored on today
  // is too short once it is cut off at January, so early-2026 signals never
  // had 25 one-month iterations.
  const from = minusDays(signalDate, need + 30);
  let series = _histCache.get(ticker);
  if (!series || series.from > from) {
    const end = new Date().toISOString().slice(0, 10);
    const start = series && series.from < from ? series.from : from;
    const bars = await getHistoricalStockData(ticker, start, end);
    series = { from: start, bars };
    _histCache.set(ticker, series);
  }
  return series.bars.filter((h) => h.date <= signalDate);
}

// --- Best leg: hit-rate calculator + direction gate --------------------------
// Walk-forward hit rate, knowable on the signal day:
//   • daily history CAPPED AT THE SIGNAL DATE,
//   • the last 25 non-overlapping 1-month (21 trading day) iterations only,
//   • scored against the signal-day entry premium (premium / strike),
//   • no overlapping fallback and no bars after the signal day.
//
// Structure selection:
//   1. Direction from the dark pool signal (close vs avg print price).
//   2. bullish → long call, bearish → long put, when that leg's hit rate
//      qualifies; ATM straddle is the fallback.
//   3. neutral → best qualifying leg by hit rate.
async function bestLegAsOf(ticker, signalDate, strike, entry, _dte, opts, signal = {}) {
  const iterations = opts.minSamples || HIT_RATE_ITERATIONS;
  const need = Math.ceil((iterations * MONTH_TRADING_DAYS) / 0.65) + 120;
  const hist = await historyAsOf(ticker, signalDate, need);
  const spanDays = hist.length ? (new Date(hist[hist.length - 1].date) - new Date(hist[0].date)) / 86400000 : 0;
  if (spanDays < opts.minHistoryDays) {
    return null; // thin history
  }
  // Automated deal-veto: if recent realized vol has collapsed vs the long-run
  // baseline (classic M&A buyout pin), the historical hit rate is stale and the
  // forward read is dead. Veto regardless of how good the backward edge looks.
  const regime = volatilityRegimeCollapsed(hist);
  if (regime.collapsed) {
    return { vetoed: true, reason: regime.reason };
  }
  let moves = calculatePriceMovements(hist, MONTH_TRADING_DAYS)
    .filter((m) => m.startDate <= signalDate && m.endDate <= signalDate);
  if (moves.length < iterations) return null;
  moves = moves.slice(0, iterations);
  const run = (strategy, premium) => analyzeOptionsProfitability(moves, {
    strategy,
    upperBreakevenPct: premium / strike,
    lowerBreakevenPct: -(premium / strike)
  });

  const n = hist.length;
  const direction = directionFromSignal({
    signalClose: n ? hist[n - 1].close : null,
    dpAvgPrice: signal.dpAvgPrice,
    prevClose: n >= 2 ? hist[n - 2].close : null,
    close5dAgo: n >= 6 ? hist[n - 6].close : null,
    volumeRatio: signal.volumeRatio
  });

  const analyses = {
    call: { premium: entry.callPrice, a: run('call', entry.callPrice) },
    put: { premium: entry.putPrice, a: run('put', entry.putPrice) },
    straddle: { premium: entry.callPrice + entry.putPrice, a: run('straddle', entry.callPrice + entry.putPrice) }
  };
  const straddleImplied = (entry.callPrice + entry.putPrice) / strike;

  // Sample floor mirrors the calculator's 'low' data-quality threshold (>= 10
  // post-outlier samples) so a read isn't built off a handful of points.
  const qualifies = (s) => {
    const { a } = analyses[s];
    // The rate is the last 25 iterations. One or two outlier windows can be
    // dropped by the shared profitability filter; fewer than that is not the test.
    if (a.totalSamples < iterations - 2) return false;
    const floor = s === 'put' && direction === 'bearish' ? opts.putHitRateFloor : opts.minHitRate;
    if (a.profitableRate < floor || a.profitableRate > opts.maxHitRate) return false;
    if (s === 'straddle' && straddleImplied < opts.straddleImpliedFloor) return false;
    if (s === 'call' && direction === 'bearish') return false;
    if (s === 'put' && direction === 'bullish') return false;
    return true;
  };

  let chosen = null;
  if (direction !== 'neutral') {
    const preferred = direction === 'bullish' ? 'call' : 'put';
    if (qualifies(preferred)) chosen = preferred;
    else if (qualifies('straddle')) chosen = 'straddle';
  } else {
    chosen = ['call', 'put', 'straddle']
      .filter(qualifies)
      .sort((x, y) => analyses[y].a.profitableRate - analyses[x].a.profitableRate)[0] || null;
  }
  if (!chosen) {
    return {
      noQualify: true,
      rates: {
        call: Number(analyses.call.a.profitableRate.toFixed(1)),
        put: Number(analyses.put.a.profitableRate.toFixed(1)),
        straddle: Number(analyses.straddle.a.profitableRate.toFixed(1)),
        samples: analyses.call.a.totalSamples,
        direction
      }
    };
  }

  const best = analyses[chosen];
  return {
    strategy: chosen,
    premium: best.premium,
    hitRate: Number(best.a.profitableRate.toFixed(1)),
    samples: best.a.totalSamples,
    direction
  };
}

// Score one (ticker, day). Returns a track-record read, or { skip, reason }.
// Hit rate uses only prices on or before `signal.date`.
export async function scoreSignal(signal, userOpts = {}) {
  const opts = { ...DEFAULT_OPTS, ...userOpts };
  const s = signal;
  if (EXCLUDED_TICKERS.has(s.ticker)) return { skip: true, reason: 'manual exclude' };
  if (!(await isStock(s.ticker))) return { skip: true, reason: 'ETF/fund' };
  const entry = await priceEntry(s.ticker, s.date, opts.targetDte);
  const straddleImplied = (entry.callPrice + entry.putPrice) / entry.strike;
  if (straddleImplied < 0.02) return { skip: true, reason: `implied move ${(straddleImplied * 100).toFixed(2)}% too small` };
  const best = await bestLegAsOf(s.ticker, s.date, entry.strike, entry, entry.dte, opts, {
    volumeRatio: s.volume_ratio,
    dpAvgPrice: s.avg_price
  });
  if (best?.vetoed) return { skip: true, reason: best.reason };
  if (best?.noQualify) return { skip: true, reason: 'no qualifying structure', rates: best.rates };
  if (!best) return { skip: true, reason: 'no qualifying structure' };
  const contracts = best.strategy === 'call' ? [entry.callTicker]
    : best.strategy === 'put' ? [entry.putTicker]
    : [entry.callTicker, entry.putTicker];
  return {
    date: s.date,
    ticker: s.ticker,
    volume_ratio: s.volume_ratio,
    dark_pool_value: s.total_value,
    dark_pool_avg_price: s.avg_price,
    structure: best.strategy,
    direction: best.direction,
    strike: entry.strike,
    expiration: entry.expiration,
    dte: entry.dte,
    entry_premium: Number(best.premium.toFixed(2)),
    asof_hit_rate: best.hitRate,
    asof_samples: best.samples,
    contracts
  };
}

// Build reads from local processed dark-pool data. `skipTickers` lets the daily
// refresh price only NEW names (existing reads are stable history — no rebuild).
export async function buildReads(userOpts = {}, { skipTickers = null, skipKeys = null, onlyKeys = null } = {}) {
  const opts = { ...DEFAULT_OPTS, ...userOpts };
  const signals = loadLocalSignals(opts);
  console.error(`Found ${signals.length} (ticker, day) signals${opts.since ? ` since ${opts.since}` : ` in last ${opts.days} days`}. Evaluating candidates...\n`);

  const reads = [];
  for (const s of signals) {
    if (reads.length >= opts.max) break;
    const key = `${s.ticker}__${s.date}`;
    if (skipKeys && skipKeys.has(key)) continue;
    if (onlyKeys && !onlyKeys.has(key)) continue;
    if (skipTickers && skipTickers.has(s.ticker)) continue;
    try {
      const scored = await scoreSignal(s, opts);
      if (scored.skip) {
        console.error(`  ·  ${s.date} ${s.ticker.padEnd(6)} ${scored.reason}`);
        continue;
      }
      reads.push(scored);
      console.error(`  ✓  ${s.date} ${s.ticker.padEnd(6)} ${scored.structure.padEnd(8)} [${scored.direction}] edge ${scored.asof_hit_rate}%  entry $${scored.entry_premium.toFixed(2)}  exp ${scored.expiration}`);
    } catch (e) {
      console.error(`  ✗  ${s.date} ${s.ticker.padEnd(6)} ${e.message}`);
    }
  }

  return reads;
}

export { loadLocalSignals, minusDays };

async function main() {
  const opts = parseArgs();
  const reads = await buildReads(opts);
  const outName = `${opts.out}.json`;
  const out = path.join(ROOT, outName);
  fs.writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), window_days: opts.days, since: opts.since || null, reads }, null, 2));
  console.error(`\nWrote ${reads.length} reads to ${outName}`);
}

// Only run the CLI when invoked directly (not when imported by the refresh job).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
}
