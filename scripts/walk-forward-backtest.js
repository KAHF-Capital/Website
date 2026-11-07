/**
 * Walk-forward track record from 2026-01-01.
 *
 * For every dark-pool session, a ticker is a candidate when that day's share
 * volume is at least 3x the average of the previous 7 calendar days (the
 * signal day is not part of the average). The tape comes from data/processed,
 * which is the local copy of the Vercel Blob dark-pool files. Days present in
 * Blob but missing on disk are downloaded first.
 *
 * The hit rate is the last 25 non-overlapping 1-month (21 trading day)
 * iterations of an ATM ~30 DTE call, put, or straddle, using the premium
 * printed on the signal day and stock prices on or before that day.
 *
 * Usage:
 *   node scripts/walk-forward-backtest.js --list
 *   node scripts/walk-forward-backtest.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadLocalSignals, scoreSignal, DEFAULT_OPTS, SIGNAL_RULES } from './build-top-reads.js';
import blob from '../lib/blob-data.js';

const { listDataFiles, getDataFile, uploadReadsJson } = blob;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, 'walk-forward-cache.json');
const OUT = path.join(ROOT, 'track-record-reads.json');
const SINCE = '2026-01-01';
const CONCURRENCY = 3;

function loadEnv() {
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
}

function readCache() {
  if (!fs.existsSync(CACHE)) return {};
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; }
}

function writeCache(cache) {
  fs.writeFileSync(CACHE, JSON.stringify(cache));
}

async function syncMissingBlobDays() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('No BLOB_READ_WRITE_TOKEN — using local processed files only.');
    return;
  }
  const dir = path.join(ROOT, 'data', 'processed');
  fs.mkdirSync(dir, { recursive: true });
  const local = new Set(
    fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  );
  const files = await listDataFiles();
  const missing = files.filter((f) => f.filename >= '2025-12-20.json' && !local.has(f.filename));
  if (missing.length === 0) {
    console.error('Local tape already has every Blob day from 2025-12-20 forward.');
    return;
  }
  console.error(`Downloading ${missing.length} Blob day(s) missing on disk...`);
  for (const file of missing) {
    const data = await getDataFile(file.url);
    if (!data) {
      console.error(`  skipped ${file.filename} (empty)`);
      continue;
    }
    fs.writeFileSync(path.join(dir, file.filename), JSON.stringify(data));
    console.error(`  saved ${file.filename}`);
  }
}

function transient(message) {
  return /429|fetch failed|network|ECONN|ETIMEDOUT|socket|HTTP 5|aborted/i.test(message || '');
}

async function main() {
  loadEnv();
  const listOnly = process.argv.includes('--list');
  await syncMissingBlobDays();

  console.error('Scanning dark-pool tape for 3x vs the previous 7 days...');
  const signals = loadLocalSignals({ ...DEFAULT_OPTS, since: SINCE, days: 9999, volumeBaseline: 'prior' })
    .sort((a, b) => (a.date === b.date ? b.volume_ratio - a.volume_ratio : a.date < b.date ? -1 : 1));
  console.error(`${signals.length} candidate sessions from ${SINCE} through ${signals.at(-1)?.date || 'none'}.`);
  if (listOnly) {
    const byMonth = {};
    for (const s of signals) {
      const m = s.date.slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + 1;
    }
    console.log(JSON.stringify({ count: signals.length, byMonth }, null, 2));
    return;
  }

  const cache = readCache();

  for (let round = 1; round <= 3; round++) {
    const pending = signals.filter((s) => !cache[`${s.ticker}__${s.date}`]);
    if (pending.length === 0) break;
    console.error(`Round ${round}: ${pending.length} to score (${signals.length - pending.length} already cached).`);
    let cursor = 0;
    let done = 0;
    async function worker() {
      while (cursor < pending.length) {
        const s = pending[cursor++];
        const key = `${s.ticker}__${s.date}`;
        try {
          const scored = await scoreSignal(s, DEFAULT_OPTS);
          if (scored.skip) {
            cache[key] = { status: 'skip', reason: scored.reason };
            console.error(`  ·  ${s.date} ${s.ticker.padEnd(6)} ${scored.reason}`);
          } else {
            scored.found_at = `${s.date}T21:00:00.000Z`;
            cache[key] = { status: 'read', read: scored };
            console.error(`  ✓  ${s.date} ${s.ticker.padEnd(6)} ${scored.structure.padEnd(8)} [${scored.direction}] ${scored.asof_hit_rate}%  n=${scored.asof_samples}  $${scored.entry_premium}`);
          }
        } catch (err) {
          const message = err?.message || String(err);
          if (transient(message)) {
            console.error(`  …  ${s.date} ${s.ticker.padEnd(6)} retry later: ${message}`);
          } else {
            cache[key] = { status: 'skip', reason: message };
            console.error(`  ✗  ${s.date} ${s.ticker.padEnd(6)} ${message}`);
          }
        }
        done += 1;
        if (done % 5 === 0) writeCache(cache);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    writeCache(cache);
  }

  const reads = signals
    .map((s) => cache[`${s.ticker}__${s.date}`])
    .filter((row) => row?.status === 'read')
    .map((row) => row.read)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.asof_hit_rate - a.asof_hit_rate));

  const unresolved = signals.filter((s) => !cache[`${s.ticker}__${s.date}`]);
  const payload = {
    generated_at: new Date().toISOString(),
    since: SINCE,
    method: SIGNAL_RULES,
    reads
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.error(`\nWrote ${reads.length} reads to track-record-reads.json. Unresolved: ${unresolved.length}.`);

  if (process.env.BLOB_READ_WRITE_TOKEN && unresolved.length === 0) {
    await uploadReadsJson('track-record-reads.json', JSON.stringify(payload, null, 2));
    console.error(`Uploaded track-record-reads.json (${reads.length} reads).`);
  } else if (unresolved.length > 0) {
    console.error('Not uploaded — rerun to finish the unresolved names.');
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
