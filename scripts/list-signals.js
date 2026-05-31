/**
 * List every (ticker, date) pair where volume ratio >= --min-ratio over a
 * date range, applying the exact same filters the Scanner UI uses.
 *
 * Methodology mirrors lib/scanner-snapshot.js:
 *   - For each trading day D in [--since, --until], find the trailing
 *     calendar window [D-6, D] and compute per-ticker average daily volume
 *     across that window.
 *   - volume_ratio = today's total_volume / avg_7day_volume.
 *   - Apply scanner filters: total_value >= --min-value (dollars) AND
 *     avg_price >= --min-price.
 *
 * Defaults match the scanner: $250M, $50, 3.0x.
 *
 * Usage:
 *   node scripts/list-signals.js --since 2026-01-01
 *   node scripts/list-signals.js --since 2026-01-01 --min-ratio 5
 *   node scripts/list-signals.js --since 2026-01-01 --until 2026-03-01 --csv > signals.csv
 *   node scripts/list-signals.js --since 2026-01-01 --recurring   (only tickers appearing 3+ times)
 */
const fs = require('fs');
const path = require('path');

// .env.local loader (no dotenv dependency)
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

function parseArgs(argv) {
  const args = {
    since: '2026-01-01',
    until: null,
    minRatio: 3.0,
    minValue: 250_000_000,
    minPrice: 50,
    csv: false,
    recurring: false,
    averageDays: 7
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--since') { args.since = next; i++; }
    else if (a === '--until') { args.until = next; i++; }
    else if (a === '--min-ratio') { args.minRatio = parseFloat(next); i++; }
    else if (a === '--min-value') { args.minValue = parseFloat(next); i++; }
    else if (a === '--min-price') { args.minPrice = parseFloat(next); i++; }
    else if (a === '--avg-days') { args.averageDays = parseInt(next, 10); i++; }
    else if (a === '--csv') { args.csv = true; }
    else if (a === '--recurring') { args.recurring = true; }
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 22).join('\n'));
      process.exit(0);
    }
  }
  return args;
}

function fmtMoney(n) {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('Missing BLOB_READ_WRITE_TOKEN in .env.local');
    process.exit(1);
  }

  console.error(`[list-signals] since=${args.since} until=${args.until || 'latest'} ratio>=${args.minRatio}x value>=${fmtMoney(args.minValue)} price>=$${args.minPrice}`);
  console.error('[list-signals] Listing blob files...');

  const files = await listDataFiles();
  if (files.length === 0) {
    console.error('No data files in blob storage.');
    process.exit(1);
  }

  // Sort ascending by date so we can walk forward
  const asc = [...files].sort((a, b) => a.filename.localeCompare(b.filename));
  const sinceFilename = `${args.since}.json`;
  const untilFilename = args.until ? `${args.until}.json` : null;

  const inRange = asc.filter((f) => {
    if (f.filename < sinceFilename) return false;
    if (untilFilename && f.filename > untilFilename) return false;
    return true;
  });

  if (inRange.length === 0) {
    console.error(`No files in range. Available files span ${asc[0].filename} to ${asc[asc.length - 1].filename}.`);
    process.exit(1);
  }

  console.error(`[list-signals] Scanning ${inRange.length} trading days (out of ${files.length} total in blob)...`);

  // Build a memoized cache so each file is fetched once total.
  const cache = new Map();
  async function load(file) {
    if (cache.has(file.filename)) return cache.get(file.filename);
    const p = getDataFile(file.url).catch((e) => {
      console.warn(`  skipped ${file.filename}: ${e.message}`);
      return null;
    });
    cache.set(file.filename, p);
    return p;
  }

  // For each day in range, build the trailing 7-day window and compute ratios.
  const rows = [];
  for (const file of inRange) {
    const filenameDate = file.filename.replace('.json', '');
    const currentDate = new Date(`${filenameDate}T12:00:00Z`);
    const earliest = new Date(currentDate);
    earliest.setUTCDate(currentDate.getUTCDate() - (args.averageDays - 1));
    const earliestStamp = earliest.toISOString().slice(0, 10);

    const window = asc.filter((f) => {
      const stamp = f.filename.replace('.json', '');
      return stamp >= earliestStamp && stamp <= filenameDate;
    });

    // Sum per-ticker volumes across the window
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

    const currentData = await load(file);
    if (!currentData?.tickers) continue;

    for (const t of currentData.tickers) {
      const avg = counts[t.ticker] > 0 ? sums[t.ticker] / counts[t.ticker] : 0;
      if (avg <= 0) continue;
      const ratio = t.total_volume / avg;
      if (ratio < args.minRatio) continue;
      if ((t.total_value || 0) < args.minValue) continue;
      if ((t.avg_price || 0) < args.minPrice) continue;
      rows.push({
        date: filenameDate,
        ticker: t.ticker,
        avg_price: t.avg_price,
        volume_ratio: ratio,
        total_value: t.total_value,
        total_volume: t.total_volume,
        trade_count: t.trade_count,
        avg_7day_volume: avg,
        window_days: counts[t.ticker]
      });
    }

    // Progress tick so the user knows we're alive on slow blob reads
    if (inRange.length > 20 && (inRange.indexOf(file) + 1) % 10 === 0) {
      console.error(`  processed ${inRange.indexOf(file) + 1} / ${inRange.length} days, ${rows.length} signals so far...`);
    }
  }

  // Optional "recurring only" filter (ticker appears 3+ times)
  let finalRows = rows;
  if (args.recurring) {
    const counts = rows.reduce((acc, r) => ((acc[r.ticker] = (acc[r.ticker] || 0) + 1), acc), {});
    finalRows = rows.filter((r) => counts[r.ticker] >= 3);
    console.error(`[list-signals] Filtered to ${finalRows.length} signals on ${Object.keys(counts).filter((k) => counts[k] >= 3).length} recurring tickers.`);
  }

  // Sort: date asc, then ratio desc within day
  finalRows.sort((a, b) => (a.date === b.date ? b.volume_ratio - a.volume_ratio : a.date.localeCompare(b.date)));

  if (args.csv) {
    console.log('date,ticker,avg_price,volume_ratio,total_value,total_volume,trade_count');
    for (const r of finalRows) {
      console.log(
        `${r.date},${r.ticker},${r.avg_price.toFixed(2)},${r.volume_ratio.toFixed(2)},${r.total_value},${r.total_volume},${r.trade_count}`
      );
    }
  } else {
    console.log('');
    console.log(`Found ${finalRows.length} signals matching ratio >= ${args.minRatio}x, value >= ${fmtMoney(args.minValue)}, price >= $${args.minPrice}.`);
    console.log('');
    console.log('Date         Ticker   Avg Price    Vol Ratio    Notional       Trades');
    console.log('─'.repeat(78));
    for (const r of finalRows) {
      console.log(
        `${r.date.padEnd(13)}${r.ticker.padEnd(9)}$${r.avg_price.toFixed(2).padStart(8)}    ${r.volume_ratio.toFixed(2).padStart(5)}x      ${fmtMoney(r.total_value).padStart(8)}      ${r.trade_count.toLocaleString().padStart(7)}`
      );
    }
    console.log('');

    // Summary by ticker
    const byTicker = {};
    for (const r of finalRows) {
      if (!byTicker[r.ticker]) byTicker[r.ticker] = { count: 0, maxRatio: 0, totalNotional: 0 };
      byTicker[r.ticker].count++;
      byTicker[r.ticker].maxRatio = Math.max(byTicker[r.ticker].maxRatio, r.volume_ratio);
      byTicker[r.ticker].totalNotional += r.total_value;
    }
    const summary = Object.entries(byTicker).sort((a, b) => b[1].count - a[1].count || b[1].maxRatio - a[1].maxRatio);

    console.log(`Summary — ${summary.length} unique tickers, top by signal count:`);
    console.log('─'.repeat(60));
    console.log('Ticker    # signals    Peak ratio    Total notional');
    for (const [ticker, s] of summary.slice(0, 30)) {
      console.log(
        `${ticker.padEnd(10)}${String(s.count).padStart(5)}        ${s.maxRatio.toFixed(2).padStart(5)}x       ${fmtMoney(s.totalNotional)}`
      );
    }
    if (summary.length > 30) {
      console.log(`... and ${summary.length - 30} more (use --csv to get the full list)`);
    }
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
