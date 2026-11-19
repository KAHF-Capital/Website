// Adapters over KAHF's existing backends. Kimi consumes these as-is: it does
// not modify them and does not decide what counts as a signal.
//
//   Signals      reads/top-reads.json + reads/track-record-reads.json (Vercel Blob,
//                bundled copies locally), filtered with the backend's own
//                publish rules in lib/read-filters.js (same as /api/wins)
//   Prints       lib/scanner-snapshot.js, lib/scanner-history.js
//   Prices       lib/polygon-data-service.js
//   Backtests    lib/options-analysis-service.js (runHistoricalAnalysis, getOptionsQuote)
//   Live marks   lib/reads-live.js (markRead)
//
// Tests replace any adapter with setBackendForTests().

import fs from 'fs';
import path from 'path';
import { getReadsJson } from '../blob-data.js';
import { getScannerSnapshot } from '../scanner-snapshot.js';
import { getTickerHistory } from '../scanner-history.js';
import { getCurrentStockPrice, getHistoricalStockData, calculatePriceMovements } from '../polygon-data-service.js';
import { STRATEGIES, runHistoricalAnalysis, getOptionsQuote, calculateOverlappingMovements } from '../options-analysis-service.js';
import { markRead, structureLabel } from '../reads-live.js';
import { isExcluded } from '../read-filters.js';
import { KIMI_CONFIG } from './kimi.config.js';
import { clockNow } from './runtime.js';

export function signalIdOf(read) {
  const explicit = read?.signal_id || read?.backend_signal_id || read?.id;
  if (explicit) return String(explicit);
  const ticker = String(read?.ticker || '').trim().toUpperCase();
  const date = String(read?.date || '').trim();
  return ticker && date ? `${ticker}__${date}` : null;
}

async function readSignalFile(filename) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const fromBlob = await getReadsJson(filename).catch(() => null);
    if (fromBlob && Array.isArray(fromBlob.reads)) return { data: fromBlob, source: 'blob' };
  }
  try {
    const local = JSON.parse(fs.readFileSync(path.join(process.cwd(), filename), 'utf8'));
    if (Array.isArray(local.reads)) return { data: local, source: 'local' };
  } catch {
    // Not bundled in this environment.
  }
  return { data: null, source: null };
}

async function loadPublishedSignals() {
  const [latest, history] = await Promise.all([
    readSignalFile(KIMI_CONFIG.signals.latestFile),
    readSignalFile(KIMI_CONFIG.signals.historyFile)
  ]);
  const byId = new Map();
  const rejected = new Map();
  const add = (reads, feed) => {
    for (const read of reads || []) {
      if (!read?.ticker || !read?.date) continue;
      const id = signalIdOf(read);
      if (!id) continue;
      if (isExcluded(read.ticker)) rejected.set(id, 'excluded_ticker');
      else if (!byId.has(id)) byId.set(id, { id, read, feed });
    }
  };
  add(latest.data?.reads, 'latest');
  add(history.data?.reads, 'history');
  return {
    ok: Boolean(latest.data || history.data),
    historyOk: Boolean(history.data),
    source: history.source || latest.source,
    method: history.data?.method || latest.data?.method || null,
    generatedAt: history.data?.generated_at || latest.data?.generated_at || null,
    historySince: history.data?.since || null,
    signals: [...byId.values()],
    rejected: [...rejected.entries()].filter(([id]) => !byId.has(id)).map(([id, reason]) => ({ id, reason }))
  };
}

function printRow(ticker, row) {
  return {
    ticker,
    date: row.date,
    shares: row.total_volume ?? null,
    notional_usd: row.total_value ?? null,
    avg_price: typeof row.avg_price === 'number' ? Number(row.avg_price.toFixed(2)) : null,
    trade_count: row.trade_count ?? null,
    volume_ratio_vs_7d: typeof row.volume_ratio === 'number' ? Number(row.volume_ratio.toFixed(2)) : null
  };
}

async function getRecentPrints({ ticker = null, since = null, minNotional = 0, limit = 10 } = {}) {
  if (ticker) {
    const history = await getTickerHistory(ticker);
    let rows = (history.days || []).map((d) => printRow(history.ticker, d));
    if (since) rows = rows.filter((r) => r.date >= since);
    if (minNotional) rows = rows.filter((r) => (r.notional_usd || 0) >= minNotional);
    return { ticker: history.ticker, source: history.source, sessions: rows.slice(-limit).reverse(), granularity: 'session aggregate' };
  }
  const snapshot = await getScannerSnapshot();
  if (!snapshot) return { sessions: [], reason: 'No scanner session available' };
  const rows = (snapshot.tickers || [])
    .filter((t) => (t.total_value || 0) >= (minNotional || 0))
    .sort((a, b) => (b.volume_ratio || 0) - (a.volume_ratio || 0))
    .slice(0, limit)
    .map((t) => printRow(t.ticker, { ...t, date: snapshot.date }));
  return { date: snapshot.date, source: 'scanner-snapshot', sessions: rows, granularity: 'session aggregate' };
}

// The scanner snapshot behind getRecentPrints downloads several daily files on
// a cold start. Share in-flight and recent results so a prefetch started when a
// message arrives is reused by the tool call.
const printsCache = new Map();
const PRINTS_TTL_MS = 60 * 1000;

function cachedRecentPrints(args = {}) {
  const key = JSON.stringify([args.ticker || null, args.since || null, args.minNotional || 0, args.limit || 10]);
  const hit = printsCache.get(key);
  if (hit && Date.now() - hit.at < PRINTS_TTL_MS) return hit.promise;
  const promise = getRecentPrints(args).catch((err) => {
    printsCache.delete(key);
    throw err;
  });
  printsCache.set(key, { at: Date.now(), promise });
  if (printsCache.size > 200) printsCache.delete(printsCache.keys().next().value);
  return promise;
}

async function getPreviousClose(ticker) {
  const price = await getCurrentStockPrice(ticker);
  return { ticker, price, basis: 'previous session close' };
}

async function getDailyBars(ticker, from, to) {
  return getHistoricalStockData(ticker, from, to);
}

/**
 * The N-day windows that runHistoricalAnalysis scores, rebuilt with the
 * backend's own helpers and constants so Kimi can derive per-window returns.
 * Callers check the result against the backend's totals before using it.
 */
async function getAnalysisWindows({ ticker, daysToExpiration, asOfDate = null }) {
  const MIN_PERIODS = 25;
  const dte = daysToExpiration || 30;
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(asOfDate || '') ? asOfDate : clockNow().toISOString().split('T')[0];
  const endMs = new Date(`${endDate}T12:00:00Z`).getTime();
  const calendarDaysNeeded = Math.max(750, Math.ceil((MIN_PERIODS * dte) / 0.7) + 60);
  const startDate = new Date(endMs - calendarDaysNeeded * 86400000).toISOString().split('T')[0];
  const bars = (await getHistoricalStockData(ticker, startDate, endDate)).filter((bar) => bar.date <= endDate);
  let moves = calculatePriceMovements(bars, dte);
  let overlapping = false;
  if (moves.length < MIN_PERIODS) {
    moves = calculateOverlappingMovements(bars, dte);
    overlapping = true;
  }
  let filtered = moves.filter((m) => Math.abs(m.percentMove) <= 0.5);
  if (filtered.length === 0) filtered = moves;
  return {
    windows: filtered,
    overlapping,
    historyStart: bars[0]?.date || null,
    historyEnd: bars[bars.length - 1]?.date || null
  };
}

// Coarse SIC -> sector map for watchlist sector matching (delivery filter only).
const SIC_SECTORS = [
  ['Real Estate', [[6500, 6599], [6798, 6798]]],
  ['Financials', [[6000, 6799]]],
  ['Utilities', [[4900, 4999]]],
  ['Energy', [[1200, 1399], [2900, 2999], [4610, 4619]]],
  ['Healthcare', [[2830, 2836], [3841, 3851], [5047, 5047], [5122, 5122], [8000, 8099]]],
  ['Communication Services', [[2710, 2799], [4800, 4899], [7810, 7829]]],
  ['Technology', [[3570, 3579], [3600, 3699], [3820, 3829], [7370, 7379]]],
  ['Consumer Staples', [[2000, 2199], [2840, 2844], [5140, 5149], [5400, 5499], [5912, 5912]]],
  ['Consumer Discretionary', [[2300, 2399], [2500, 2599], [3711, 3716], [3940, 3949], [5000, 5999], [7000, 7099], [7900, 7999]]],
  ['Materials', [[1000, 1099], [1400, 1499], [2600, 2699], [2800, 2899], [3200, 3399]]],
  ['Industrials', [[1500, 1799], [3400, 3569], [3580, 3599], [3700, 3799], [3800, 3840], [4000, 4799], [7380, 7389], [8700, 8799]]]
];

export const SECTORS = SIC_SECTORS.map(([name]) => name).sort();

export function sectorFromSic(sicCode) {
  const code = parseInt(sicCode, 10);
  if (!Number.isFinite(code)) return null;
  for (const [name, ranges] of SIC_SECTORS) {
    if (ranges.some(([lo, hi]) => code >= lo && code <= hi)) return name;
  }
  return null;
}

async function getTickerSector(ticker) {
  if (!process.env.POLYGON_API_KEY) return null;
  const res = await fetch(`https://api.massive.com/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${process.env.POLYGON_API_KEY}`);
  if (!res.ok) return null;
  const data = await res.json();
  const sic = data?.results?.sic_code;
  return { sector: sectorFromSic(sic), sic_code: sic || null, sic_description: data?.results?.sic_description || null };
}

const defaultAdapters = {
  structures: STRATEGIES,
  structureLabel,
  loadPublishedSignals,
  getRecentPrints: cachedRecentPrints,
  getPreviousClose,
  getDailyBars,
  getLiveOptionQuote: (ticker, expiration, structure) => getOptionsQuote(ticker, expiration, structure),
  runStructureBacktest: (config) => runHistoricalAnalysis(config),
  getAnalysisWindows,
  markSignal: (read) => markRead(read),
  getTickerSector
};

let overrides = null;

export function backend() {
  return overrides ? { ...defaultAdapters, ...overrides } : defaultAdapters;
}

export function setBackendForTests(partial) {
  overrides = partial;
}
