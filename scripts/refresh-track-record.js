/**
 * refresh-track-record.js
 *
 * Keeps the public track record + homepage scoreboard up to date AUTOMATICALLY,
 * with no redeploy. Designed to run at the tail of the daily `node process-csv`
 * job (after fresh dark-pool data lands locally + in Blob).
 *
 * What it does:
 *   1. Loads the existing full track record (from Blob, falling back to the
 *      bundled track-record-reads.json).
 *   2. Builds reads only for NEW tickers since TRACK_START (existing reads are
 *      stable history — never re-priced, so the record can't churn or revise).
 *   3. Merges + writes track-record-reads.json locally AND uploads it to Blob.
 *   4. Derives the homepage "top reads" (last N days, best by edge), writes
 *      top-reads.json locally AND uploads it to Blob.
 *
 * The site (/api/wins, /api/top-reads) reads the Blob copies at runtime, so the
 * pages reflect new reads within the cache TTL — entirely hands-off.
 *
 * Usage: node scripts/refresh-track-record.js [--since 2026-01-01] [--window 90] [--top 8]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildReads, minusDays, DEFAULT_OPTS } from './build-top-reads.js';
import { EXCLUDED_TICKERS } from '../lib/read-filters.js';
import blob from '../lib/blob-data.js';

const { getReadsJson, uploadReadsJson } = blob;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TRACK_FILE = 'track-record-reads.json';
const TOP_FILE = 'top-reads.json';

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { since: '2026-01-01', window: 90, top: 8 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--since') o.since = a[++i];
    else if (a[i] === '--window') o.window = parseInt(a[++i], 10);
    else if (a[i] === '--top') o.top = parseInt(a[++i], 10);
  }
  return o;
}

// Prefer the live Blob copy; fall back to the bundled local file (first run).
async function loadExisting(filename) {
  const fromBlob = await getReadsJson(filename).catch(() => null);
  if (fromBlob && Array.isArray(fromBlob.reads)) return fromBlob;
  const local = path.join(ROOT, filename);
  if (fs.existsSync(local)) {
    try { return JSON.parse(fs.readFileSync(local, 'utf8')); } catch {}
  }
  return { reads: [] };
}

async function writeBoth(filename, payload) {
  const json = JSON.stringify(payload, null, 2);
  fs.writeFileSync(path.join(ROOT, filename), json);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await uploadReadsJson(filename, json);
    console.error(`☁️  Uploaded ${filename} to Vercel Blob (${payload.reads.length} reads)`);
  } else {
    console.error(`⚠️  No BLOB_READ_WRITE_TOKEN — wrote ${filename} locally only`);
  }
}

async function main() {
  const opts = parseArgs();
  console.error('🔁 Refreshing track record (incremental)...\n');

  const MIN_HIT_RATE = DEFAULT_OPTS.minHitRate; // 60% gate (shared with the build step)
  const readKey = (r) => `${r.ticker}__${r.date}`;

  const existing = await loadExisting(TRACK_FILE);
  // Apply the live gate to the existing record too: drop excluded names AND any
  // historical read whose as-of edge is below the current threshold, so the
  // record only ever contains signals that clear the 60% bar.
  const existingReads = (Array.isArray(existing.reads) ? existing.reads : [])
    .filter((r) => !EXCLUDED_TICKERS.has(r.ticker))
    .filter((r) => (r.asof_hit_rate ?? 0) >= MIN_HIT_RATE);
  // Skip (ticker, day) pairs we've already priced — every distinct day is its own
  // signal, so a ticker can appear on multiple dates.
  const knownKeys = new Set(existingReads.map(readKey));
  console.error(`Existing track record: ${existingReads.length} reads (gate >= ${MIN_HIT_RATE}%).`);

  // Price only (ticker, day) signals we haven't logged yet. High max = no cap.
  const newReads = await buildReads(
    { since: opts.since, days: 9999, max: 100000, out: TRACK_FILE.replace('.json', '') },
    { skipKeys: knownKeys }
  );
  console.error(`\nAdded ${newReads.length} new read(s).`);

  // Merge (existing wins on any (ticker, day) collision) + sort newest first.
  const byKey = new Map();
  for (const r of [...existingReads, ...newReads]) {
    if (!byKey.has(readKey(r))) byKey.set(readKey(r), r);
  }
  const merged = [...byKey.values()].sort((a, b) => (a.date < b.date ? 1 : -1));

  await writeBoth(TRACK_FILE, {
    generated_at: new Date().toISOString(),
    since: opts.since,
    reads: merged
  });

  // Homepage strip: the most recent reads, best edge first.
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = minusDays(today, opts.window);
  const topReads = merged
    .filter((r) => !EXCLUDED_TICKERS.has(r.ticker) && r.date >= cutoff)
    .sort((a, b) => (b.asof_hit_rate || 0) - (a.asof_hit_rate || 0))
    .slice(0, opts.top);

  await writeBoth(TOP_FILE, {
    generated_at: new Date().toISOString(),
    window_days: opts.window,
    since: cutoff,
    reads: topReads
  });

  console.error(`\n✅ Track record: ${merged.length} reads · Homepage: ${topReads.length} reads (last ${opts.window}d).`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
