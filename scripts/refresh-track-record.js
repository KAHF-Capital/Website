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
 *   2. Scores each flat-file session passed with --signal-day, using only
 *      data from that session. Days that were not part of this ingestion
 *      are left as they are.
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
import { buildReads, scoreSession, DEFAULT_OPTS } from './build-top-reads.js';
import { EXCLUDED_TICKERS, isPublishedOnSignalSession } from '../lib/read-filters.js';
import blob from '../lib/blob-data.js';

const { getReadsJson, uploadReadsJson } = blob;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TRACK_FILE = 'track-record-reads.json';
const TOP_FILE = 'top-reads.json';

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { since: '2026-01-01', top: 8, rebuild: false, signalDays: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--since') o.since = a[++i];
    // Newest trading day the calling ingestion run brought in (process-csv.js).
    // Signals are only generated when it is the latest processed day.
    else if (a[i] === '--signal-day') o.signalDays.push(a[++i]);
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
  // the refresh re-added them with a fresh found_at
  // re-alerted months-old signals as "new".
  const floorFor = (r) => (r.structure === 'put' ? PUT_FLOOR : MIN_HIT_RATE);
  const loaded = Array.isArray(existing.reads) ? existing.reads : [];
  const existingReads = loaded
    .filter((r) => !EXCLUDED_TICKERS.has(r.ticker))
    .filter((r) => (r.asof_hit_rate ?? 0) >= floorFor(r) && (r.asof_hit_rate ?? 0) <= MAX_HIT_RATE);
  // Skip (ticker, day) pairs we've already priced — every distinct day is its own
  // signal, so a ticker can appear on multiple dates.
  const knownKeys = new Set(existingReads.map(readKey));
  console.error(`Existing track record: ${existingReads.length} reads (band ${MIN_HIT_RATE}%–${MAX_HIT_RATE}%).`);

  // Score the flat-file sessions this run just wrote. Each session is judged
  // on its own day. Days already on disk from an earlier run are not reopened.
  const latestDay = latestProcessedDay();
  const liveDay = latestDay;
  const requestedDays = [...new Set(opts.signalDays)]
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const daysToScore = requestedDays.length ? requestedDays : (liveDay ? [liveDay] : []);
  const buildOpts = { days: 9999, max: 100000, out: TRACK_FILE.replace('.json', '') };

  const publish = async (added) => {
    const byKey = new Map();
    for (const r of [...existingReads, ...added]) {
      if (!byKey.has(readKey(r))) byKey.set(readKey(r), r);
    }
    const merged = [...byKey.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    const homepageDay = daysToScore.at(-1) || liveDay;
    const topReads = merged
      .filter((r) => r.date === homepageDay && !EXCLUDED_TICKERS.has(r.ticker))
      .sort((a, b) => (b.asof_hit_rate || 0) - (a.asof_hit_rate || 0))
      .slice(0, opts.top);
    await writeBoth(TRACK_FILE, {
      generated_at: new Date().toISOString(),
      since: opts.since,
      reads: merged
    });
    await writeBoth(TOP_FILE, {
      generated_at: new Date().toISOString(),
      signal_date: homepageDay,
      reads: topReads
    });
    return merged.length;
  };

  let newReads = [];
  if (opts.rebuild) {
    // --rebuild re-prices reads that were already published on their day; it
    // never adds new (ticker, day) pairs. Carry over found_at stamps so
    // re-priced history is not treated as a new read.
    const prior = await loadExisting(TRACK_FILE);
    const priorReads = (Array.isArray(prior.reads) ? prior.reads : [])
      .filter((r) => !EXCLUDED_TICKERS.has(r.ticker));
    const priorStamps = new Map(priorReads.map((r) => [readKey(r), r.found_at ?? null]));
    newReads = await buildReads({ ...buildOpts, since: opts.since }, { onlyKeys: new Set(priorStamps.keys()) });
    for (const r of newReads) r.found_at = priorStamps.get(readKey(r)) ?? null;
  } else if (!daysToScore.length) {
    console.error('No processed dark-pool days found — nothing to score.');
  } else {
    const foundAt = new Date().toISOString();
    for (const day of daysToScore) {
      try {
        const batch = await scoreSession(day, { skipKeys: knownKeys });
        for (const r of batch) {
          // A same-morning run keeps the real publish time. A later batch is
          // stamped on the session itself so the page still shows the read.
          r.found_at = isPublishedOnSignalSession(r.date, foundAt) ? foundAt : `${r.date}T21:00:00.000Z`;
          knownKeys.add(readKey(r));
        }
        newReads.push(...batch);
        const total = await publish(newReads);
        const names = batch.map((r) => r.ticker).join(', ') || 'none qualified';
        console.error(`Saved ${day}: ${batch.length} tradeable read(s) (${names}). Track record now ${total}.`);
      } catch (err) {
        console.error(`Day ${day} failed. Earlier days in this batch are already saved. ${err.message}`);
      }
    }
  }
  if (opts.rebuild) {
    await publish(newReads);
  }
  console.error(`\nAdded ${newReads.length} new read(s) across ${daysToScore.length} session(s).`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
