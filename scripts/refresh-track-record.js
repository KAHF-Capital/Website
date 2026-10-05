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
 *   2. Builds reads only from the latest processed trading day (if fresh) —
 *      older days never become reads after the fact. Existing reads are stable
 *      history — never re-priced, so the record can't churn or revise.
 *   3. Merges + writes track-record-reads.json locally AND uploads it to Blob.
 *   4. Derives the homepage "top reads" (latest ingested day only, best by
 *      edge), writes top-reads.json locally AND uploads it to Blob.
 *
 * The site (/api/wins, /api/top-reads) reads the Blob copies at runtime, so the
 * pages reflect new reads within the cache TTL — entirely hands-off.
 *
 * Usage: node scripts/refresh-track-record.js [--since 2026-01-01] [--top 8] [--signal-day YYYY-MM-DD]
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
  const o = { since: '2026-01-01', top: 8, rebuild: false, signalDay: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--since') o.since = a[++i];
    // Newest trading day the calling ingestion run brought in (process-csv.js).
    // Signals are only generated when it is the latest processed day.
    else if (a[i] === '--signal-day') o.signalDay = a[++i];
    else if (a[i] === '--top') o.top = parseInt(a[++i], 10);
    // Recompute the ENTIRE record from scratch (ignore existing reads). Use after
    // changing the hit-rate methodology or gate so every read is consistent.
    else if (a[i] === '--rebuild') o.rebuild = true;
  }
  return o;
}

function latestProcessedDay() {
  const dir = path.join(ROOT, 'data', 'processed');
  if (!fs.existsSync(dir)) return null;
  const days = fs.readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace('.json', ''))
    .sort();
  return days.length ? days[days.length - 1] : null;
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

  const MIN_HIT_RATE = DEFAULT_OPTS.minHitRate; // lower gate (shared with the build step)
  const MAX_HIT_RATE = DEFAULT_OPTS.maxHitRate; // upper cap — above this is likely a bad read
  const PUT_FLOOR = DEFAULT_OPTS.putHitRateFloor; // direction-confirmed puts qualify lower
  const readKey = (r) => `${r.ticker}__${r.date}`;

  const existing = opts.rebuild ? { reads: [] } : await loadExisting(TRACK_FILE);
  if (opts.rebuild) console.error('♻️  --rebuild: recomputing the entire record from scratch.\n');
  // Apply the live band to the existing record too: drop excluded names AND any
  // historical read whose hit rate is outside the believable band. The floor
  // must mirror the build gate exactly (puts qualify at PUT_FLOOR) — using the
  // generic floor here dropped valid puts from the known set every morning, so
  // the refresh re-added them with a fresh found_at and the 10am digest
  // re-alerted months-old signals as "new".
  const floorFor = (r) => (r.structure === 'put' ? PUT_FLOOR : MIN_HIT_RATE);
  const existingReads = (Array.isArray(existing.reads) ? existing.reads : [])
    .filter((r) => !EXCLUDED_TICKERS.has(r.ticker))
    .filter((r) => (r.asof_hit_rate ?? 0) >= floorFor(r) && (r.asof_hit_rate ?? 0) <= MAX_HIT_RATE);
  // Skip (ticker, day) pairs we've already priced — every distinct day is its own
  // signal, so a ticker can appear on multiple dates.
  const knownKeys = new Set(existingReads.map(readKey));
  console.error(`Existing track record: ${existingReads.length} reads (band ${MIN_HIT_RATE}%–${MAX_HIT_RATE}%).`);

  // A read only qualifies if the unusual dark-pool activity happened on the
  // trading day this run is publishing. Only the latest processed day is
  // scored, and only while it's fresh (covers weekends/holidays before the
  // next-morning run). Older days are never turned into reads after the fact —
  // not from a backlog batch, a methodology change, or an un-excluded ticker.
  const MAX_SIGNAL_AGE_DAYS = 5;
  const today = new Date().toISOString().slice(0, 10);
  const latestDay = latestProcessedDay();
  const liveDay = latestDay && latestDay >= minusDays(today, MAX_SIGNAL_AGE_DAYS) ? latestDay : null;
  const buildOpts = { days: 9999, max: 100000, out: TRACK_FILE.replace('.json', '') };

  let newReads = [];
  if (opts.rebuild) {
    // --rebuild re-prices reads that were already published on their day; it
    // never adds new (ticker, day) pairs. Carry over found_at stamps so
    // re-priced history doesn't flood the next digest.
    const prior = await loadExisting(TRACK_FILE);
    const priorReads = Array.isArray(prior.reads) ? prior.reads : [];
    const priorStamps = new Map(priorReads.map((r) => [readKey(r), r.found_at ?? null]));
    newReads = await buildReads({ ...buildOpts, since: opts.since }, { onlyKeys: new Set(priorStamps.keys()) });
    for (const r of newReads) r.found_at = priorStamps.get(readKey(r)) ?? null;
  } else if (!latestDay) {
    console.error('No processed dark-pool days found — nothing to score.');
  } else if (!liveDay) {
    console.error(`Latest processed day ${latestDay} is older than ${MAX_SIGNAL_AGE_DAYS}d — not a live signal day, skipping.`);
  } else if (opts.signalDay && opts.signalDay !== liveDay) {
    console.error(`This run ingested through ${opts.signalDay}, but the latest day is ${liveDay} — older data never generates signals, skipping.`);
  } else {
    console.error(`Scoring signals from ${liveDay} only.\n`);
    newReads = await buildReads({ ...buildOpts, since: liveDay }, { skipKeys: knownKeys });
    // Provenance stamp: publish time. Powers the "New" badge on /wins and tells
    // the 10am cron which reads to headline.
    const foundAt = new Date().toISOString();
    for (const r of newReads) r.found_at = foundAt;
  }
  console.error(`\nAdded ${newReads.length} new read(s).`);

  // Merge (existing wins on any (ticker, day) collision).
  const byKey = new Map();
  for (const r of [...existingReads, ...newReads]) {
    if (!byKey.has(readKey(r))) byKey.set(readKey(r), r);
  }

  // ONE tradeable read per ticker. A ticker can fire a 3x+ dark-pool signal on
  // several different days, but we only publish its single strongest setup —
  // the best leg (call/put/straddle) on the best day — so the record isn't
  // dominated by any one name (e.g. a ticker showing up over and over). Pick the
  // highest as-of hit rate; tie-break on more samples, then the more recent date.
  //
  // Exception: a read from the live (latest ingested) day is always published
  // alongside the ticker's historical best — today's signal must never be
  // swallowed by an older, stronger read of the same name.
  const betterRead = (a, b) => {
    if ((a.asof_hit_rate || 0) !== (b.asof_hit_rate || 0)) return (a.asof_hit_rate || 0) > (b.asof_hit_rate || 0);
    if ((a.asof_samples || 0) !== (b.asof_samples || 0)) return (a.asof_samples || 0) > (b.asof_samples || 0);
    return a.date > b.date;
  };
  const bestByTicker = new Map();
  const liveReads = [];
  for (const r of byKey.values()) {
    if (liveDay && r.date === liveDay) { liveReads.push(r); continue; }
    const cur = bestByTicker.get(r.ticker);
    if (!cur || betterRead(r, cur)) bestByTicker.set(r.ticker, r);
  }
  const merged = [...bestByTicker.values(), ...liveReads].sort((a, b) => (a.date < b.date ? 1 : -1));

  await writeBoth(TRACK_FILE, {
    generated_at: new Date().toISOString(),
    since: opts.since,
    reads: merged
  });

  // Homepage strip: ONLY signals from the latest ingested day, best edge first.
  // 3x+ names from earlier days are not carried forward — a signal is live on
  // its day or not at all. Empty when there's no fresh day (or nothing fired).
  const topReads = liveReads
    .filter((r) => !EXCLUDED_TICKERS.has(r.ticker))
    .sort((a, b) => (b.asof_hit_rate || 0) - (a.asof_hit_rate || 0))
    .slice(0, opts.top);

  await writeBoth(TOP_FILE, {
    generated_at: new Date().toISOString(),
    signal_date: liveDay,
    reads: topReads
  });

  console.error(`\n✅ Track record: ${merged.length} reads · Homepage: ${topReads.length} reads (signal day ${liveDay ?? 'none'}).`);

  // Subscriber notifications now happen in the 10am ET cron
  // (/api/automated-scanner), which leads the daily digest with any read whose
  // found_at stamp is <24h old. Run this script before 10am ET on trading days.
  const publishedNew = merged.filter((r) => !knownKeys.has(readKey(r)));
  if (publishedNew.length > 0 && !opts.rebuild) {
    console.error(`📣 ${publishedNew.length} new read(s) will lead the next 10am ET digest: ${publishedNew.map((r) => r.ticker).join(', ')}`);
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
