/**
 * Build straddle track-record entries from historical dark pool signals.
 *
 * For each (ticker, signal_date) where the scanner flagged a 3x+ volume ratio:
 *   1. Look up the historical ATM straddle on the signal date (~30 DTE).
 *   2. Look up the underlying close on that contract's expiration date.
 *   3. Compute the straddle P/L: max(|expiry_close - strike| - premium, -premium).
 *   4. Emit a row in the track-record schema.
 *
 * Filters (defaults match the scanner):
 *   --since      2026-01-01       (signal date lower bound)
 *   --until      <today - 35d>    (only settled 30-day expirations)
 *   --min-ratio  3.0              (volume ratio >= )
 *   --min-value  250000000        (notional in dollars >= )
 *   --min-price  50               (avg share price >= )
 *   --max-price  5000             (avg share price <=  — excludes BRK.A etc.)
 *   --target-dte 30               (target days to expiration)
 *   --include-etfs                (default: ETFs excluded via Polygon ticker type)
 *
 * Output:
 *   - <out>.json   one entry per signal, matches the track_record Firestore schema
 *   - <out>.csv    same data, flat csv for spreadsheet review
 *
 * Usage:
 *   node scripts/build-track-record.js
 *   node scripts/build-track-record.js --since 2026-01-01 --out track-record-jan
 *   node scripts/build-track-record.js --dry-run     (skip API, just show filter counts)
 *
 * Requires Polygon ("massive.com") plan with historical options aggregates
 * — Options Starter ($79/mo) or higher.
 */
const fs = require('fs');
const path = require('path');

// .env.local loader
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  });
}

const { listDataFiles, getDataFile } = require('../lib/blob-data');

const POLYGON_KEY = process.env.POLYGON_API_KEY;
const API_BASE = 'https://api.massive.com';

if (!POLYGON_KEY) {
  console.error('Missing POLYGON_API_KEY in .env.local');
  process.exit(1);
}

// ---------------------------------------------------------------------------
//  CLI args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const today = new Date();
  const fortyDaysAgo = new Date(today);
  fortyDaysAgo.setUTCDate(today.getUTCDate() - 35);

  const args = {
    since: '2026-01-01',
    until: fortyDaysAgo.toISOString().slice(0, 10),
    minRatio: 3.0,
    minValue: 250_000_000,
    minPrice: 50,
    maxPrice: 5000,
    targetDte: 30,
    averageDays: 7,
    includeEtfs: false,
    dryRun: false,
    out: 'track-record-candidates'
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const n = argv[i + 1];
    if (a === '--since') { args.since = n; i++; }
    else if (a === '--until') { args.until = n; i++; }
    else if (a === '--min-ratio') { args.minRatio = parseFloat(n); i++; }
    else if (a === '--min-value') { args.minValue = parseFloat(n); i++; }
    else if (a === '--min-price') { args.minPrice = parseFloat(n); i++; }
    else if (a === '--max-price') { args.maxPrice = parseFloat(n); i++; }
    else if (a === '--target-dte') { args.targetDte = parseInt(n, 10); i++; }
    else if (a === '--include-etfs') { args.includeEtfs = true; }
    else if (a === '--dry-run') { args.dryRun = true; }
    else if (a === '--out') { args.out = n; i++; }
  }
  return args;
}

// ---------------------------------------------------------------------------
//  Polygon helpers (used historically — including expired contracts)
// ---------------------------------------------------------------------------
async function fetchJson(url, { tries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status === 429) {
        await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
        continue;
      }
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        const err = new Error(`HTTP ${r.status} ${r.statusText} ${body.slice(0, 200)}`);
        err.status = r.status;
        throw err;
      }
      return await r.json();
    } catch (e) {
      lastErr = e;
      if (attempt === tries - 1) throw e;
    }
  }
  throw lastErr;
}

async function getTickerType(ticker) {
  const url = `${API_BASE}/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${POLYGON_KEY}`;
  try {
    const data = await fetchJson(url);
    return data.results?.type || null;
  } catch (e) {
    return null; // treat as unknown
  }
}

async function getStockCloseOnDate(ticker, date) {
  const url = `${API_BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${date}/${date}?adjusted=true&apiKey=${POLYGON_KEY}`;
  const data = await fetchJson(url);
  const bar = data.results?.[0];
  return bar?.c ?? null;
}

// Stock close on the next trading day on/after `date`.
async function getStockCloseOnOrAfter(ticker, date) {
  const start = new Date(`${date}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  const url = `${API_BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${date}/${end.toISOString().slice(0, 10)}?adjusted=true&sort=asc&apiKey=${POLYGON_KEY}`;
  const data = await fetchJson(url);
  return data.results?.[0] || null;
}

// List option contracts with expiration in a window.
// Polygon's `as_of` returns contracts that were ACTIVE on that date, so we don't
// also pass `expired=true` (the two conflict and yield zero results).
async function listContractsInRange(ticker, fromDate, toDate, asOf) {
  const params = new URLSearchParams({
    underlying_ticker: ticker,
    'expiration_date.gte': fromDate,
    'expiration_date.lte': toDate,
    limit: '1000',
    apiKey: POLYGON_KEY
  });
  if (asOf) {
    params.set('as_of', asOf);
  } else {
    params.set('expired', 'true');
  }
  const url = `${API_BASE}/v3/reference/options/contracts?${params}`;
  const data = await fetchJson(url);
  return data.results || [];
}

// Daily OHLC for a single options contract on a specific date.
async function getOptionAggOnDate(optionsTicker, date) {
  const url = `${API_BASE}/v2/aggs/ticker/${encodeURIComponent(optionsTicker)}/range/1/day/${date}/${date}?adjusted=true&apiKey=${POLYGON_KEY}`;
  const data = await fetchJson(url);
  return data.results?.[0] || null;
}

// Walk back up to `maxLookback` trading days to find the most recent day this
// contract actually traded. Returns { bar, sourceDate } or null.
// Standard market practice when a leg doesn't trade on the target date.
async function getOptionAggWithFallback(optionsTicker, date, maxLookback = 5) {
  let cursor = new Date(`${date}T12:00:00Z`);
  for (let i = 0; i <= maxLookback; i++) {
    const stamp = cursor.toISOString().slice(0, 10);
    try {
      const bar = await getOptionAggOnDate(optionsTicker, stamp);
      if (bar && ((bar.vw ?? bar.c ?? 0) > 0)) {
        return { bar, sourceDate: stamp, daysBack: i };
      }
    } catch (err) {
      // Continue walking back on transient errors.
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return null;
}

// ---------------------------------------------------------------------------
//  Signals (same logic as scripts/list-signals.js)
// ---------------------------------------------------------------------------
async function loadSignals(args) {
  const files = await listDataFiles();
  const asc = [...files].sort((a, b) => a.filename.localeCompare(b.filename));
  const sinceFn = `${args.since}.json`;
  const untilFn = `${args.until}.json`;
  const inRange = asc.filter((f) => f.filename >= sinceFn && f.filename <= untilFn);

  const cache = new Map();
  const load = (f) => {
    if (cache.has(f.filename)) return cache.get(f.filename);
    const p = getDataFile(f.url).catch(() => null);
    cache.set(f.filename, p);
    return p;
  };

  const rows = [];
  for (const file of inRange) {
    const fnDate = file.filename.replace('.json', '');
    const earliest = new Date(`${fnDate}T12:00:00Z`);
    earliest.setUTCDate(earliest.getUTCDate() - (args.averageDays - 1));
    const earliestStamp = earliest.toISOString().slice(0, 10);

    const window = asc.filter((f) => {
      const stamp = f.filename.replace('.json', '');
      return stamp >= earliestStamp && stamp <= fnDate;
    });

    const sums = {};
    const counts = {};
    for (const w of window) {
      const data = await load(w);
      if (!data?.tickers) continue;
      for (const t of data.tickers) {
        sums[t.ticker] = (sums[t.ticker] || 0) + (Number(t.total_volume) || 0);
        counts[t.ticker] = (counts[t.ticker] || 0) + 1;
      }
    }

    const cur = await load(file);
    if (!cur?.tickers) continue;
    for (const t of cur.tickers) {
      const avg = counts[t.ticker] > 0 ? sums[t.ticker] / counts[t.ticker] : 0;
      if (avg <= 0) continue;
      const ratio = t.total_volume / avg;
      if (ratio < args.minRatio) continue;
      if ((t.total_value || 0) < args.minValue) continue;
      if ((t.avg_price || 0) < args.minPrice) continue;
      if ((t.avg_price || 0) > args.maxPrice) continue;
      rows.push({
        date: fnDate,
        ticker: t.ticker,
        avg_price: t.avg_price,
        total_value: t.total_value,
        total_volume: t.total_volume,
        trade_count: t.trade_count,
        volume_ratio: Number(ratio.toFixed(2))
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
//  Per-signal: price the straddle
// ---------------------------------------------------------------------------
async function priceHistoricalStraddle({ ticker, signalDate, targetDte }) {
  // Find the underlying close on the signal date — needed for ATM strike selection.
  const signalClose = await getStockCloseOnDate(ticker, signalDate);
  if (!signalClose) throw new Error('No stock close on signal date');

  // Find expirations in a window centered on signalDate + targetDte.
  const target = new Date(`${signalDate}T12:00:00Z`);
  target.setUTCDate(target.getUTCDate() + targetDte);
  const winFrom = new Date(target);
  winFrom.setUTCDate(target.getUTCDate() - 20);
  const winTo = new Date(target);
  winTo.setUTCDate(target.getUTCDate() + 20);

  const contracts = await listContractsInRange(
    ticker,
    winFrom.toISOString().slice(0, 10),
    winTo.toISOString().slice(0, 10),
    signalDate
  );
  if (contracts.length === 0) throw new Error('No options contracts in window');

  // Pick the expiration closest to target.
  const byExpiration = {};
  for (const c of contracts) {
    if (!byExpiration[c.expiration_date]) byExpiration[c.expiration_date] = [];
    byExpiration[c.expiration_date].push(c);
  }
  const expirations = Object.keys(byExpiration).sort();
  let bestExpiration = null;
  let bestDiff = Infinity;
  for (const exp of expirations) {
    const diff = Math.abs(new Date(`${exp}T12:00:00Z`) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestExpiration = exp;
    }
  }
  if (!bestExpiration) throw new Error('Could not pick expiration');

  // ATM strike for that expiration based on signal-date close.
  const expContracts = byExpiration[bestExpiration];
  let callStrike = null;
  let putStrike = null;
  let callContract = null;
  let putContract = null;
  let callDiff = Infinity;
  let putDiff = Infinity;
  for (const c of expContracts) {
    const diff = Math.abs(c.strike_price - signalClose);
    if (c.contract_type === 'call' && diff < callDiff) {
      callDiff = diff;
      callStrike = c.strike_price;
      callContract = c;
    } else if (c.contract_type === 'put' && diff < putDiff) {
      putDiff = diff;
      putStrike = c.strike_price;
      putContract = c;
    }
  }
  if (!callContract || !putContract) throw new Error('Missing ATM call or put');

  // Get options aggs on signal date — with prev-trading-day fallback per leg
  // when the contract didn't trade on the signal date itself.
  const [callResult, putResult] = await Promise.all([
    getOptionAggWithFallback(callContract.ticker, signalDate),
    getOptionAggWithFallback(putContract.ticker, signalDate)
  ]);
  if (!callResult && !putResult) {
    throw new Error('No options aggs in 5-day window (probable Polygon options-tier issue)');
  }
  if (!callResult) {
    throw new Error('Call leg never traded within 5 days of signal');
  }
  if (!putResult) {
    throw new Error('Put leg never traded within 5 days of signal');
  }
  const callPrice = callResult.bar.vw ?? callResult.bar.c ?? 0;
  const putPrice = putResult.bar.vw ?? putResult.bar.c ?? 0;
  if (callPrice <= 0 || putPrice <= 0) {
    throw new Error(`Zero premium even after fallback (call=$${callPrice}, put=$${putPrice})`);
  }
  // Track whether we used fallback so the per-row note is honest.
  const callDaysBack = callResult.daysBack;
  const putDaysBack = putResult.daysBack;
  const usedFallback = callDaysBack > 0 || putDaysBack > 0;

  // The straddle uses one shared strike; if call/put ATM strikes differ, use the call strike
  // (cents-of-a-dollar mismatch is fine; the analyst flow uses ATM-of-the-money pairing).
  const strikePrice = callStrike;
  const totalPremium = callPrice + putPrice;

  // Underlying close ON the expiration date (or the first trading day on/after — handles weekends).
  const expiryBar = await getStockCloseOnOrAfter(ticker, bestExpiration);
  if (!expiryBar) throw new Error('No expiry-date close for underlying');
  const expiryClose = expiryBar.c;
  const expiryActualDate = new Date(expiryBar.t).toISOString().slice(0, 10);

  // Straddle P/L per share: max(|S - K| - premium, -premium)
  const intrinsic = Math.abs(expiryClose - strikePrice);
  const pnlPerShare = Math.max(intrinsic - totalPremium, -totalPremium);
  const returnPct = (pnlPerShare / totalPremium) * 100;
  const result = pnlPerShare > 0 ? 'WIN' : 'LOSS';

  const dte = Math.round(
    (new Date(`${bestExpiration}T12:00:00Z`) - new Date(`${signalDate}T12:00:00Z`)) /
      (1000 * 60 * 60 * 24)
  );

  return {
    signalClose,
    strikePrice,
    expiration: bestExpiration,
    expiryActualDate,
    expiryClose,
    callPrice: Number(callPrice.toFixed(2)),
    putPrice: Number(putPrice.toFixed(2)),
    totalPremium: Number(totalPremium.toFixed(2)),
    intrinsic: Number(intrinsic.toFixed(2)),
    pnlPerShare: Number(pnlPerShare.toFixed(2)),
    returnPct: Number(returnPct.toFixed(1)),
    result,
    dte,
    callContract: callContract.ticker,
    putContract: putContract.ticker,
    usedFallback,
    callPriceSourceDate: callResult.sourceDate,
    putPriceSourceDate: putResult.sourceDate
  };
}

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);
  console.error(`[build-track-record] window=${args.since} → ${args.until}`);
  console.error(`[build-track-record] filters: ratio>=${args.minRatio}x, value>=$${(args.minValue / 1e6).toFixed(0)}M, price=$${args.minPrice}-$${args.maxPrice}`);
  console.error(`[build-track-record] target DTE: ${args.targetDte}, ETFs: ${args.includeEtfs ? 'included' : 'EXCLUDED'}`);

  // 1. Load signals
  console.error('[1/4] Loading signals from blob...');
  const rawSignals = await loadSignals(args);
  console.error(`      ${rawSignals.length} signals before ETF filter.`);

  // 2. Classify tickers (CS = common stock, ETF = exchange-traded fund, etc.)
  const uniqueTickers = [...new Set(rawSignals.map((s) => s.ticker))];
  console.error(`[2/4] Classifying ${uniqueTickers.length} unique tickers via Polygon /v3/reference/tickers...`);
  const tickerType = {};
  let typeIdx = 0;
  for (const t of uniqueTickers) {
    typeIdx++;
    if (typeIdx % 25 === 0) console.error(`      ${typeIdx} / ${uniqueTickers.length}`);
    tickerType[t] = await getTickerType(t);
  }
  const csTickers = uniqueTickers.filter((t) => tickerType[t] === 'CS').length;
  const etfTickers = uniqueTickers.filter((t) => tickerType[t] === 'ETF').length;
  const otherTickers = uniqueTickers.length - csTickers - etfTickers;
  console.error(`      ${csTickers} common stocks, ${etfTickers} ETFs, ${otherTickers} other/unknown.`);

  // 3. Filter
  const filtered = rawSignals.filter((s) => {
    const type = tickerType[s.ticker];
    if (args.includeEtfs) return type !== null;
    // Only keep common stocks. Unknown types are excluded for safety.
    return type === 'CS';
  });
  console.error(`      ${filtered.length} signals after type filter.`);

  if (args.dryRun) {
    console.error('');
    console.error('--- DRY RUN — would price the following straddles ---');
    for (const s of filtered.slice(0, 20)) {
      console.error(`  ${s.date}  ${s.ticker.padEnd(7)} $${s.avg_price.toFixed(2).padStart(8)}  ${s.volume_ratio.toFixed(2)}x  notional ${(s.total_value / 1e6).toFixed(0)}M`);
    }
    if (filtered.length > 20) console.error(`  ... and ${filtered.length - 20} more`);
    console.error('');
    console.error(`Total straddles to price: ${filtered.length}`);
    console.error(`Estimated Polygon calls:  ~${filtered.length * 5} (1 contracts list + 2 options aggs + 2 stock closes per signal)`);
    return;
  }

  // 4. Price each straddle
  console.error(`[3/4] Pricing ${filtered.length} straddles via Polygon historical aggs...`);
  const entries = [];
  const failures = [];
  let optionsTierError = false;
  let i = 0;
  for (const s of filtered) {
    i++;
    const tag = `${s.date} ${s.ticker}`;
    try {
      const r = await priceHistoricalStraddle({
        ticker: s.ticker,
        signalDate: s.date,
        targetDte: args.targetDte
      });
      const entry = {
        date: s.date,
        ticker: s.ticker,
        result: r.result,
        estimated_return_pct: r.returnPct,
        volume_ratio: s.volume_ratio,
        total_value: s.total_value,
        avg_price: s.avg_price,
        // Extra context for the admin UI
        strike_price: r.strikePrice,
        expiration_date: r.expiration,
        expiry_actual_date: r.expiryActualDate,
        expiry_close: r.expiryClose,
        call_premium: r.callPrice,
        put_premium: r.putPrice,
        total_premium: r.totalPremium,
        dte_actual: r.dte,
        used_fallback: r.usedFallback,
        call_price_source_date: r.callPriceSourceDate,
        put_price_source_date: r.putPriceSourceDate,
        note: `ATM straddle $${r.strikePrice}, ${r.dte} DTE, exp ${r.expiration}. Premium $${r.totalPremium}/share, closed at $${r.expiryClose} (intrinsic $${r.intrinsic}). ${r.result} ${r.returnPct > 0 ? '+' : ''}${r.returnPct}%.${r.usedFallback ? ' (Fallback price used for one leg.)' : ''}`
      };
      entries.push(entry);
      const flag = r.result === 'WIN' ? '✓' : '✗';
      const fb = r.usedFallback ? ' [fb]' : '';
      console.error(`  ${flag} ${i}/${filtered.length}  ${tag.padEnd(20)}  K=$${r.strikePrice.toFixed(2)}  prem=$${r.totalPremium.toFixed(2)}  exp=${r.expiration}  close=$${r.expiryClose.toFixed(2)}  ${r.result} ${r.returnPct > 0 ? '+' : ''}${r.returnPct.toFixed(1)}%${fb}`);
    } catch (err) {
      failures.push({ ...s, error: err.message });
      console.error(`  · ${i}/${filtered.length}  ${tag.padEnd(20)}  SKIP: ${err.message}`);
      if (err.message.includes('options-tier') || err.status === 403) {
        optionsTierError = true;
      }
    }
  }

  // 5. Write output
  console.error(`[4/4] Writing output...`);
  const outBase = path.join(__dirname, '..', args.out);
  fs.writeFileSync(`${outBase}.json`, JSON.stringify(entries, null, 2));
  const csvHeader = 'date,ticker,result,return_pct,volume_ratio,total_value,avg_price,strike,expiration,expiry_actual,expiry_close,call_premium,put_premium,total_premium,dte_actual';
  const csvRows = entries.map((e) => [
    e.date, e.ticker, e.result, e.estimated_return_pct, e.volume_ratio,
    e.total_value, e.avg_price, e.strike_price, e.expiration_date,
    e.expiry_actual_date, e.expiry_close, e.call_premium, e.put_premium,
    e.total_premium, e.dte_actual
  ].join(','));
  fs.writeFileSync(`${outBase}.csv`, [csvHeader, ...csvRows].join('\n'));
  fs.writeFileSync(`${outBase}-failures.json`, JSON.stringify(failures, null, 2));

  // Summary
  const wins = entries.filter((e) => e.result === 'WIN').length;
  const losses = entries.filter((e) => e.result === 'LOSS').length;
  const totalReturn = entries.reduce((s, e) => s + e.estimated_return_pct, 0);
  const avgReturn = entries.length ? totalReturn / entries.length : 0;
  const avgWinReturn = wins ? entries.filter((e) => e.result === 'WIN').reduce((s, e) => s + e.estimated_return_pct, 0) / wins : 0;
  const avgLossReturn = losses ? entries.filter((e) => e.result === 'LOSS').reduce((s, e) => s + e.estimated_return_pct, 0) / losses : 0;

  console.error('');
  console.error('========================================');
  console.error(`Wrote ${entries.length} entries to ${args.out}.{json,csv}`);
  console.error(`Skipped: ${failures.length} (see ${args.out}-failures.json)`);
  console.error('----------------------------------------');
  console.error(`Wins:        ${wins}    (${entries.length ? ((wins / entries.length) * 100).toFixed(1) : 0}%)`);
  console.error(`Losses:      ${losses}`);
  console.error(`Avg return:  ${avgReturn > 0 ? '+' : ''}${avgReturn.toFixed(1)}%`);
  console.error(`Avg win:     +${avgWinReturn.toFixed(1)}%`);
  console.error(`Avg loss:    ${avgLossReturn.toFixed(1)}%`);
  console.error('========================================');

  if (optionsTierError) {
    console.error('');
    console.error('⚠️  Some calls returned 403 / options-tier errors.');
    console.error('   Your Polygon plan may not include historical options aggregates.');
    console.error('   Upgrade to "Options Starter" ($79/mo) for full historical options data.');
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
