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
 *   node scripts/build-top-reads.js [--days 30] [--max 8] [--min-hit-rate 55]
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

const { calculateOverlappingMovements, analyzeOptionsProfitability } = await import(
  '../lib/options-analysis-service.js'
);
const { getHistoricalStockData } = await import('../lib/polygon-data-service.js');

const API_BASE = 'https://api.massive.com';
const KEY = process.env.POLYGON_API_KEY;
if (!KEY) {
  console.error('Missing POLYGON_API_KEY');
  process.exit(1);
}

export const DEFAULT_OPTS = { days: 30, since: null, out: 'top-reads', max: 8, minHitRate: 55, minSamples: 25, minVolRatio: 3.0, minValue: 250_000_000, minPrice: 50, maxPrice: 5000, minHistoryDays: 400, targetDte: 30, averageDays: 7 };

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
async function isStock(ticker) {
  try {
    const data = await fetchJson(`${API_BASE}/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${KEY}`);
    const type = data.results?.type;
    return !NON_STOCK_TYPES.has(type);
  } catch {
    return true; // unknown — don't over-filter
  }
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
function loadLocalSignals(opts) {
  const dir = path.join(ROOT, 'data', 'processed');
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (files.length === 0) return [];
  const latest = files[files.length - 1].replace('.json', '');
  const since = opts.since || minusDays(latest, opts.days);

  const read = (fn) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, fn), 'utf8')); } catch { return null; }
  };

  const inRange = files.filter((f) => f.replace('.json', '') >= since);
  const rows = [];
  for (const file of inRange) {
    const fnDate = file.replace('.json', '');
    const earliest = minusDays(fnDate, opts.averageDays - 1);
    const window = files.filter((f) => { const s = f.replace('.json', ''); return s >= earliest && s <= fnDate; });
    const sums = {}; const counts = {};
    for (const w of window) {
      const data = read(w);
      if (!data?.tickers) continue;
      for (const t of data.tickers) {
        sums[t.ticker] = (sums[t.ticker] || 0) + (Number(t.total_volume) || 0);
        counts[t.ticker] = (counts[t.ticker] || 0) + 1;
      }
    }
    const cur = read(file);
    if (!cur?.tickers) continue;
    for (const t of cur.tickers) {
      const avg = counts[t.ticker] > 0 ? sums[t.ticker] / counts[t.ticker] : 0;
      if (avg <= 0) continue;
      const ratio = t.total_volume / avg;
      if (ratio < opts.minVolRatio) continue;
      if ((t.total_value || 0) < opts.minValue) continue;
      if ((t.avg_price || 0) < opts.minPrice || (t.avg_price || 0) > opts.maxPrice) continue;
      rows.push({
        date: fnDate, ticker: t.ticker, avg_price: t.avg_price,
        total_value: t.total_value, total_volume: t.total_volume,
        trade_count: t.trade_count, volume_ratio: Number(ratio.toFixed(2))
      });
    }
  }
  // Keep the strongest signal per ticker (highest volume ratio), most recent wins ties.
  const byTicker = new Map();
  for (const r of rows) {
    const prev = byTicker.get(r.ticker);
    if (!prev || r.volume_ratio > prev.volume_ratio) byTicker.set(r.ticker, r);
  }
  return [...byTicker.values()].sort((a, b) => b.volume_ratio - a.volume_ratio);
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

// --- Step-forward best leg (no lookahead) ----------------------------------
async function bestLegAsOf(ticker, signalDate, strike, entry, dte, opts) {
  const need = Math.max(750, Math.ceil((opts.minSamples * dte) / 0.7) + 60);
  const hist = (await getHistoricalStockData(ticker, minusDays(signalDate, need), signalDate)).filter((h) => h.date <= signalDate);
  if (hist.length && (new Date(signalDate) - new Date(hist[0].date)) / 86400000 < opts.minHistoryDays) {
    return null; // thin history
  }
  const moves = calculateOverlappingMovements(hist, dte);
  const run = (strategy, premium) => analyzeOptionsProfitability(moves, {
    strategy,
    upperBreakevenPct: premium / strike,
    lowerBreakevenPct: -(premium / strike)
  });
  const legs = [
    { strategy: 'call', premium: entry.callPrice, a: run('call', entry.callPrice) },
    { strategy: 'put', premium: entry.putPrice, a: run('put', entry.putPrice) },
    { strategy: 'straddle', premium: entry.callPrice + entry.putPrice, a: run('straddle', entry.callPrice + entry.putPrice) }
  ].filter((l) => l.a.totalSamples >= opts.minSamples).sort((x, y) => y.a.profitableRate - x.a.profitableRate);
  const best = legs[0];
  if (!best || best.a.profitableRate < opts.minHitRate) return null;
  return { strategy: best.strategy, premium: best.premium, hitRate: Number(best.a.profitableRate.toFixed(1)), samples: best.a.totalSamples };
}

// Build reads from local processed dark-pool data. `skipTickers` lets the daily
// refresh price only NEW names (existing reads are stable history — no rebuild).
export async function buildReads(userOpts = {}, { skipTickers = null } = {}) {
  const opts = { ...DEFAULT_OPTS, ...userOpts };
  const signals = loadLocalSignals(opts);
  console.error(`Found ${signals.length} unique-ticker signals${opts.since ? ` since ${opts.since}` : ` in last ${opts.days} days`}. Evaluating candidates...\n`);

  const reads = [];
  for (const s of signals) {
    if (reads.length >= opts.max) break;
    if (skipTickers && skipTickers.has(s.ticker)) continue;
    try {
      if (!(await isStock(s.ticker))) { console.error(`  ·  ${s.date} ${s.ticker.padEnd(6)} skipped (ETF/fund)`); continue; }
      const entry = await priceEntry(s.ticker, s.date, opts.targetDte);

      // Sanity floor: an ATM straddle should imply at least ~2% of move, a
      // single leg ~1%. Tiny premiums = stale/illiquid prints (bad data) — skip.
      const straddleImplied = (entry.callPrice + entry.putPrice) / entry.strike;
      if (straddleImplied < 0.02) {
        console.error(`  ·  ${s.date} ${s.ticker.padEnd(6)} implied move ${(straddleImplied * 100).toFixed(2)}% too small (illiquid/bad data)`);
        continue;
      }

      const best = await bestLegAsOf(s.ticker, s.date, entry.strike, entry, entry.dte, opts);
      if (!best) { console.error(`  ·  ${s.date} ${s.ticker.padEnd(6)} no qualifying structure`); continue; }

      const contracts = best.strategy === 'call' ? [entry.callTicker]
        : best.strategy === 'put' ? [entry.putTicker]
        : [entry.callTicker, entry.putTicker];

      reads.push({
        date: s.date,
        ticker: s.ticker,
        volume_ratio: s.volume_ratio,
        dark_pool_value: s.total_value,
        dark_pool_avg_price: s.avg_price,
        structure: best.strategy,
        strike: entry.strike,
        expiration: entry.expiration,
        dte: entry.dte,
        entry_premium: Number(best.premium.toFixed(2)),
        asof_hit_rate: best.hitRate,
        asof_samples: best.samples,
        contracts
      });
      console.error(`  ✓  ${s.date} ${s.ticker.padEnd(6)} ${best.strategy.padEnd(8)} edge ${best.hitRate}%  entry $${best.premium.toFixed(2)}  exp ${entry.expiration}`);
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
