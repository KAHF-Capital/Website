/**
 * Build the compact dark-pool history index used by KAHF AI, the scanner
 * history modal, ticker pages, and the calculator.
 *
 *   node scripts/build-scanner-history-index.js
 *   node scripts/build-scanner-history-index.js --upload
 *   node scripts/build-scanner-history-index.js --append data/processed/2026-10-24.json --upload
 *
 * Volume ratios are point-in-time: a session's ratio never uses a later session.
 * The build checks that against the raw daily files before it writes.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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

const {
  AVERAGE_DAYS,
  VOLUME_RATIO_METHOD,
  windowStart,
  volumeRatioFromSamples,
  shardId,
  annotateVolumeRatios,
  addUtcDays
} = require('../lib/scanner-math');

const ROOT = path.join(__dirname, '..');
const PROCESSED_DIR = path.join(ROOT, 'data', 'processed');
const INDEX_DIR = path.join(ROOT, 'data', 'history-index');
const DATE_FILE = /^\d{4}-\d{2}-\d{2}\.json$/;

function assertMath() {
  const early = annotateVolumeRatios([
    { date: '2026-01-05', total_volume: 100, avg_price: 10, total_value: 1000, trade_count: 1 }
  ]);
  const withFuture = annotateVolumeRatios([
    { date: '2026-01-05', total_volume: 100, avg_price: 10, total_value: 1000, trade_count: 1 },
    { date: '2026-01-06', total_volume: 100000, avg_price: 10, total_value: 1, trade_count: 1 }
  ]);
  if (early[0].volume_ratio !== withFuture[0].volume_ratio) {
    throw new Error('Look-ahead: a later session changed an earlier volume ratio');
  }
  // Jan 8 window starts Jan 2. Jan 1 must not be included.
  const series = annotateVolumeRatios([
    { date: '2026-01-01', total_volume: 100, avg_price: 1, total_value: 1, trade_count: 1 },
    { date: '2026-01-02', total_volume: 100, avg_price: 1, total_value: 1, trade_count: 1 },
    { date: '2026-01-08', total_volume: 300, avg_price: 1, total_value: 1, trade_count: 1 }
  ]);
  const jan8 = series.find((row) => row.date === '2026-01-08');
  if (jan8.volume_ratio !== 1.5 || jan8.window_days !== 2 || jan8.window_start !== '2026-01-02') {
    throw new Error(`Window math mismatch: ${JSON.stringify(jan8)}`);
  }
  if (series[0].volume_ratio !== 1) {
    throw new Error('A single session should have a 1.00 ratio');
  }
}

function writeGzipJson(relPath, data) {
  const filePath = path.join(INDEX_DIR, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(data)));
  fs.writeFileSync(filePath, gz);
  return gz.length;
}

function readGzipJson(relPath) {
  const buf = fs.readFileSync(path.join(INDEX_DIR, relPath));
  return JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
}

function readManifest() {
  const filePath = path.join(INDEX_DIR, 'manifest.json');
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeManifest(manifest) {
  fs.mkdirSync(INDEX_DIR, { recursive: true });
  fs.writeFileSync(path.join(INDEX_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

async function uploadRel(relPath) {
  const { put } = require('@vercel/blob');
  const abs = path.join(INDEX_DIR, relPath);
  const body = fs.readFileSync(abs);
  await put(`darkpool-history/${relPath.replace(/\\/g, '/')}`, body, {
    access: 'private',
    contentType: relPath.endsWith('.gz') ? 'application/gzip' : 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

async function uploadMany(relPaths) {
  const queue = [...relPaths];
  let done = 0;
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const rel = queue.shift();
      await uploadRel(rel);
      done += 1;
      if (done % 25 === 0 || done === relPaths.length) {
        console.error(`[history-index] uploaded ${done}/${relPaths.length}`);
      }
    }
  });
  await Promise.all(workers);
}

async function listSourceDays() {
  const localNames = fs.existsSync(PROCESSED_DIR)
    ? fs.readdirSync(PROCESSED_DIR).filter((name) => DATE_FILE.test(name))
    : [];
  const byName = new Map(localNames.map((filename) => [filename, { filename, local: true }]));

  if (process.env.BLOB_READ_WRITE_TOKEN && !process.argv.includes('--local-only')) {
    try {
      const { listDataFiles } = require('../lib/blob-data');
      const blobs = await listDataFiles();
      for (const blob of blobs) {
        if (!byName.has(blob.filename)) {
          byName.set(blob.filename, { filename: blob.filename, local: false, url: blob.url });
        }
      }
      console.error(`[history-index] local days ${localNames.length}, blob days ${blobs.length}, union ${byName.size}`);
    } catch (error) {
      console.error(`[history-index] blob list failed, using local files only: ${error.message}`);
    }
  } else {
    console.error(`[history-index] using ${localNames.length} local days`);
  }

  return [...byName.values()].sort((a, b) => a.filename.localeCompare(b.filename));
}

async function loadSourceDay(entry) {
  if (entry.local) {
    return JSON.parse(fs.readFileSync(path.join(PROCESSED_DIR, entry.filename), 'utf8'));
  }
  const { getDataFile } = require('../lib/blob-data');
  return getDataFile(entry.url || entry.filename);
}

function tuplesToSeries(tuples, dateList) {
  return tuples.map((tuple) => ({
    date: dateList[tuple[0]],
    total_volume: tuple[1],
    avg_price: tuple[2],
    total_value: tuple[3],
    trade_count: tuple[4]
  }));
}

function buildManifest(dateList, tickerCount, shardIds) {
  return {
    builtAt: new Date().toISOString(),
    averageDays: AVERAGE_DAYS,
    method: VOLUME_RATIO_METHOD,
    firstDate: dateList[0] || null,
    latestDate: dateList[dateList.length - 1] || null,
    dates: dateList,
    tickerCount,
    shards: shardIds.sort()
  };
}

async function buildFull() {
  const entries = await listSourceDays();
  if (entries.length === 0) throw new Error('No processed dark-pool days found');

  const dateList = [];
  const dateId = new Map();
  const byTicker = new Map();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const date = entry.filename.replace('.json', '');
    if (!dateId.has(date)) {
      dateId.set(date, dateList.length);
      dateList.push(date);
    }
    const id = dateId.get(date);
    const data = await loadSourceDay(entry);
    for (const ticker of data.tickers || []) {
      let rows = byTicker.get(ticker.ticker);
      if (!rows) {
        rows = [];
        byTicker.set(ticker.ticker, rows);
      }
      rows.push([
        id,
        Number(ticker.total_volume) || 0,
        Number(ticker.avg_price) || 0,
        Number(ticker.total_value) || 0,
        Number(ticker.trade_count) || 0
      ]);
    }
    if ((i + 1) % 20 === 0 || i === entries.length - 1) {
      console.error(`[history-index] read ${i + 1}/${entries.length} days, ${byTicker.size} tickers`);
    }
  }

  const latest = dateList[dateList.length - 1];
  const mid = dateList[Math.max(0, dateList.length - 30)];
  const checkDates = [...new Set([mid, latest])];
  const volumeByDate = new Map();
  for (const date of checkDates) {
    const start = windowStart(date, AVERAGE_DAYS);
    const windowEntries = entries.filter((entry) => {
      const stamp = entry.filename.replace('.json', '');
      return stamp >= start && stamp <= date;
    });
    for (const entry of windowEntries) {
      const stamp = entry.filename.replace('.json', '');
      if (volumeByDate.has(stamp)) continue;
      const data = await loadSourceDay(entry);
      const volumes = new Map();
      for (const ticker of data.tickers || []) volumes.set(ticker.ticker, Number(ticker.total_volume) || 0);
      volumeByDate.set(stamp, volumes);
    }
  }

  const tickerCount = byTicker.size;
  const shardBuckets = new Map();
  const dayRows = new Map(dateList.map((date) => [date, []]));
  const samples = [];
  let mismatchCount = 0;
  let checked = 0;
  for (const ticker of [...byTicker.keys()]) {
    const tuples = byTicker.get(ticker);
    byTicker.delete(ticker);
    const series = annotateVolumeRatios(tuplesToSeries(tuples, dateList));
    for (const date of checkDates) {
      const row = series.find((item) => item.date === date);
      if (!row) continue;
      const start = windowStart(date, AVERAGE_DAYS);
      let sum = 0;
      let count = 0;
      for (const [stamp, volumes] of volumeByDate) {
        if (stamp < start || stamp > date || !volumes.has(ticker)) continue;
        sum += volumes.get(ticker);
        count += 1;
      }
      const expected = volumeRatioFromSamples(sum, count, row.total_volume).volumeRatio;
      checked += 1;
      if (expected !== row.volume_ratio) {
        mismatchCount += 1;
        if (samples.length < 8) samples.push({ ticker, date, expected, got: row.volume_ratio });
      }
    }
    const id = shardId(ticker);
    let bucket = shardBuckets.get(id);
    if (!bucket) {
      bucket = {};
      shardBuckets.set(id, bucket);
    }
    bucket[ticker] = series.map((row) => [row.date, row.total_volume, row.avg_price, row.total_value, row.trade_count]);
    for (const row of series) {
      dayRows.get(row.date).push([
        ticker,
        row.total_volume,
        row.avg_price,
        row.total_value,
        row.trade_count,
        row.volume_ratio,
        row.avg_7day_volume
      ]);
    }
  }
  console.error(`[history-index] verify ${checkDates.join(', ')}: ${checked} ticker-days, ${mismatchCount} mismatches`);
  if (mismatchCount > 0) {
    console.error(samples);
    throw new Error('Volume ratios do not match the scanner window');
  }

  const written = [];
  let shardBytes = 0;
  for (const [id, tickers] of shardBuckets) {
    const rel = `shards/${id}.json.gz`;
    shardBytes += writeGzipJson(rel, { tickers });
    written.push(rel);
  }
  let dayBytes = 0;
  for (const date of dateList) {
    const rel = `days/${date}.json.gz`;
    dayBytes += writeGzipJson(rel, { date, rows: dayRows.get(date) });
    written.push(rel);
  }
  const manifest = buildManifest(dateList, tickerCount, [...shardBuckets.keys()]);
  writeManifest(manifest);
  written.push('manifest.json');
  console.error(
    `[history-index] wrote ${shardBuckets.size} shards (${(shardBytes / 1e6).toFixed(1)} MB gzip) ` +
    `and ${dateList.length} days (${(dayBytes / 1e6).toFixed(1)} MB gzip), ${tickerCount} tickers, ` +
    `${dateList[0]} → ${latest}`
  );
  return written;
}

function seriesFromShard(shard, ticker) {
  const tuples = shard?.tickers?.[ticker];
  if (!Array.isArray(tuples)) return [];
  return tuples.map((tuple) => ({
    date: tuple[0],
    total_volume: Number(tuple[1]) || 0,
    avg_price: Number(tuple[2]) || 0,
    total_value: Number(tuple[3]) || 0,
    trade_count: Number(tuple[4]) || 0
  }));
}

async function appendDay(filePath) {
  const manifest = readManifest();
  if (!manifest) throw new Error('No history index yet. Run a full build first.');
  const abs = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const date = data.date || data.csv_date || path.basename(abs, '.json');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Cannot read a session date from ${abs}`);

  const touched = new Map();
  const updatedTickers = new Set();
  for (const ticker of data.tickers || []) {
    const id = shardId(ticker.ticker);
    if (!touched.has(id)) {
      const rel = `shards/${id}.json.gz`;
      const existing = fs.existsSync(path.join(INDEX_DIR, rel)) ? readGzipJson(rel) : { tickers: {} };
      touched.set(id, existing);
    }
    const shard = touched.get(id);
    const series = seriesFromShard(shard, ticker.ticker).filter((row) => row.date !== date);
    series.push({
      date,
      total_volume: Number(ticker.total_volume) || 0,
      avg_price: Number(ticker.avg_price) || 0,
      total_value: Number(ticker.total_value) || 0,
      trade_count: Number(ticker.trade_count) || 0
    });
    series.sort((a, b) => a.date.localeCompare(b.date));
    const annotated = annotateVolumeRatios(series);
    shard.tickers[ticker.ticker] = annotated.map((row) => [row.date, row.total_volume, row.avg_price, row.total_value, row.trade_count]);
    shard._annotated = shard._annotated || new Map();
    shard._annotated.set(ticker.ticker, annotated);
    updatedTickers.add(ticker.ticker);
  }

  const written = [];
  for (const [id, shard] of touched) {
    const annotated = shard._annotated;
    delete shard._annotated;
    const rel = `shards/${id}.json.gz`;
    writeGzipJson(rel, { tickers: shard.tickers });
    written.push(rel);
    shard._annotated = annotated;
  }

  const dates = new Set(manifest.dates || []);
  dates.add(date);
  const affectedEnd = addUtcDays(date, AVERAGE_DAYS - 1);
  const affected = [...dates].filter((stamp) => stamp >= date && stamp <= affectedEnd).sort();
  for (const stamp of affected) {
    const rel = `days/${stamp}.json.gz`;
    const rows = [];
    if (stamp !== date && fs.existsSync(path.join(INDEX_DIR, rel))) {
      const existing = readGzipJson(rel);
      if (Array.isArray(existing.rows)) {
        for (const row of existing.rows) {
          if (!updatedTickers.has(row[0])) rows.push(row);
        }
      }
    }
    for (const shard of touched.values()) {
      for (const [ticker, annotated] of shard._annotated) {
        const row = annotated.find((item) => item.date === stamp);
        if (!row) continue;
        rows.push([
          ticker,
          row.total_volume,
          row.avg_price,
          row.total_value,
          row.trade_count,
          row.volume_ratio,
          row.avg_7day_volume
        ]);
      }
    }
    writeGzipJson(rel, { date: stamp, rows });
    written.push(rel);
  }

  const shardIds = new Set(manifest.shards || []);
  for (const id of touched.keys()) shardIds.add(id);
  const nextDates = [...dates].sort();
  const nextManifest = buildManifest(nextDates, manifest.tickerCount || updatedTickers.size, [...shardIds]);
  writeManifest(nextManifest);
  written.push('manifest.json');
  console.error(`[history-index] appended ${date} across ${touched.size} shards, rewrote ${affected.length} session boards`);
  return written;
}

function parseArgs(argv) {
  const args = { upload: false, append: null, selfCheck: false };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--upload') args.upload = true;
    else if (token === '--self-check') args.selfCheck = true;
    else if (token === '--upload-only') args.uploadOnly = true;
    else if (token === '--append') {
      args.append = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function walkIndex(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (fs.statSync(abs).isDirectory()) out.push(...walkIndex(abs, rel));
    else out.push(rel.replace(/\\/g, '/'));
  }
  return out;
}

async function main() {
  assertMath();
  console.error('[history-index] point-in-time ratio check passed');
  const args = parseArgs(process.argv);
  if (args.selfCheck) return;
  if (args.uploadOnly) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Missing BLOB_READ_WRITE_TOKEN');
    const written = walkIndex(INDEX_DIR);
    console.error(`[history-index] uploading ${written.length} existing index files`);
    await uploadMany(written);
    console.error('[history-index] upload complete');
    return;
  }

  const written = args.append ? await appendDay(args.append) : await buildFull();
  if (args.upload) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Missing BLOB_READ_WRITE_TOKEN');
    console.error(`[history-index] uploading ${written.length} files`);
    await uploadMany(written);
    console.error('[history-index] upload complete');
  }
}

main().catch((error) => {
  console.error(`[history-index] ${error.stack || error.message}`);
  process.exit(1);
});
