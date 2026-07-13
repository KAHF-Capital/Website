// Collects everything needed to backtest methodology changes on the YTD track
// record WITHOUT lookahead:
//   - both-leg (call+put) entry premiums on the signal date
//   - full daily price path of both contracts (for straddle TP/SL simulation
//     and current marks on open reads)
//   - stock history CAPPED AT THE SIGNAL DATE (honest as-of hit rates)
//   - direction indicators: signal-day close vs dark pool avg price, 1-day
//     return, 5-day momentum
//   - stock close at expiration (settled reads)
//
// Results are cached to backtest-data.json (keyed ticker__date) so re-runs
// only fetch what's missing. Usage: node scripts/collect-backtest-data.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
    if (!(k in process.env)) process.env[k] = t.slice(eq + 1).trim();
  }
})();

const API_BASE = 'https://api.massive.com';
const KEY = process.env.POLYGON_API_KEY;
if (!KEY) { console.error('Missing POLYGON_API_KEY'); process.exit(1); }

const OUT = path.join(ROOT, 'backtest-data.json');
const dayStr = (d) => d.toISOString().slice(0, 10);
function minusDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return dayStr(d);
}
function plusDays(dateStr, days) { return minusDays(dateStr, -days); }

async function fetchJson(url, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 1200 * (i + 1))); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { lastErr = e; await new Promise((s) => setTimeout(s, 400)); }
  }
  throw lastErr;
}

// O:TICKER + YYMMDD + C|P + strike*1000 padded to 8
function otherLeg(contractTicker) {
  const m = contractTicker.match(/^(O:.+?\d{6})([CP])(\d{8})$/);
  if (!m) return null;
  return `${m[1]}${m[2] === 'C' ? 'P' : 'C'}${m[3]}`;
}
function legType(contractTicker) {
  const m = contractTicker.match(/^O:.+?\d{6}([CP])\d{8}$/);
  return m ? (m[1] === 'C' ? 'call' : 'put') : null;
}

async function getOptionDailyBars(contractTicker, from, to) {
  const data = await fetchJson(
    `${API_BASE}/v2/aggs/ticker/${encodeURIComponent(contractTicker)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=500&apiKey=${KEY}`
  );
  return (data.results || []).map((b) => ({
    date: dayStr(new Date(b.t)),
    close: b.c,
    vw: b.vw ?? b.c
  }));
}

async function getStockBars(ticker, from, to) {
  const data = await fetchJson(
    `${API_BASE}/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${KEY}`
  );
  return (data.results || []).map((b) => ({ date: dayStr(new Date(b.t)), close: b.c }));
}

async function collectRead(read, today) {
  const { ticker, date, expiration, dte, contracts } = read;

  // Both contract tickers (derive the missing leg for single-leg reads).
  let callTicker, putTicker;
  for (const c of contracts) {
    if (legType(c) === 'call') callTicker = c;
    else if (legType(c) === 'put') putTicker = c;
  }
  if (!callTicker && putTicker) callTicker = otherLeg(putTicker);
  if (!putTicker && callTicker) putTicker = otherLeg(callTicker);
  if (!callTicker || !putTicker) throw new Error('could not derive both legs');

  const pathEnd = expiration < today ? plusDays(expiration, 2) : today;
  const [callBars, putBars] = await Promise.all([
    getOptionDailyBars(callTicker, minusDays(date, 7), pathEnd),
    getOptionDailyBars(putTicker, minusDays(date, 7), pathEnd)
  ]);

  // Entry = last bar on/before the signal date (prod uses signal-date vw with
  // backward fallback).
  const entryBar = (bars) => [...bars].reverse().find((b) => b.date <= date && (b.vw ?? b.close) > 0) || null;
  const callEntry = entryBar(callBars);
  const putEntry = entryBar(putBars);

  // Stock history capped at the signal date — no lookahead. Same window sizing
  // as production bestLegAsOf.
  const need = Math.max(750, Math.ceil((25 * dte) / 0.7) + 60);
  const hist = await getStockBars(ticker, minusDays(date, need), date);

  // Direction indicators as of the signal date.
  const n = hist.length;
  const signalClose = n ? hist[n - 1].close : null;
  const prevClose = n >= 2 ? hist[n - 2].close : null;
  const close5dAgo = n >= 6 ? hist[n - 6].close : null;

  // Expiry close for settled reads.
  let expiryClose = null;
  if (expiration < today) {
    const bars = await getStockBars(ticker, expiration, plusDays(expiration, 7));
    expiryClose = bars.length ? bars[0].close : null;
  }

  return {
    ticker, date, expiration, dte,
    strike: read.strike,
    volume_ratio: read.volume_ratio,
    dark_pool_avg_price: read.dark_pool_avg_price,
    published_structure: read.structure,
    published_entry: read.entry_premium,
    published_asof: read.asof_hit_rate,
    callTicker, putTicker,
    callEntry: callEntry ? Number((callEntry.vw ?? callEntry.close).toFixed(2)) : null,
    putEntry: putEntry ? Number((putEntry.vw ?? putEntry.close).toFixed(2)) : null,
    callPath: callBars.filter((b) => b.date > date),
    putPath: putBars.filter((b) => b.date > date),
    signalClose, prevClose, close5dAgo,
    expiryClose,
    hist // full daily closes up to signal date (for hit-rate calc)
  };
}

async function main() {
  const { reads } = JSON.parse(fs.readFileSync(path.join(ROOT, 'track-record-reads.json'), 'utf8'));
  const today = new Date().toISOString().slice(0, 10);

  let cache = {};
  if (fs.existsSync(OUT)) {
    try { cache = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}
  }

  const pending = reads.filter((r) => !cache[`${r.ticker}__${r.date}`]);
  console.log(`${reads.length} reads total, ${pending.length} to collect (rest cached).`);

  const BATCH = 4;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (r) => {
      try {
        const data = await collectRead(r, today);
        return { key: `${r.ticker}__${r.date}`, data };
      } catch (e) {
        console.error(`  ✗ ${r.date} ${r.ticker}: ${e.message}`);
        return null;
      }
    }));
    for (const res of results) {
      if (res) { cache[res.key] = res.data; console.log(`  ✓ ${res.key}`); }
    }
    fs.writeFileSync(OUT, JSON.stringify(cache));
  }

  console.log(`\nDone. ${Object.keys(cache).length} reads in ${OUT}`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
