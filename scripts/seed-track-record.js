/**
 * seed-track-record.js
 *
 * Publishes filtered backtested trades into the `track_record` Firestore
 * collection (the same store the public /wins page + /admin/wins UI read).
 *
 * Requires Firebase Admin credentials in the environment (NOT present in the
 * local .env.local by default — they live in Vercel). Provide ONE of:
 *   FIREBASE_SERVICE_ACCOUNT_BASE64   (recommended)
 *   FIREBASE_SERVICE_ACCOUNT_KEY      (raw JSON)
 *   FIREBASE_ADMIN_PROJECT_ID + FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY
 *
 * Every entry is tagged as BACKTESTED / HYPOTHETICAL in the note for compliance.
 *
 * Usage:
 *   node scripts/seed-track-record.js --in track-record-passed-bestleg.json [--dry-run]
 *   node scripts/seed-track-record.js --in track-record-passed-bestleg.json --force   (write for real)
 *
 * Idempotent: skips any (date,ticker) already present in the collection.
 */

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
    const v = t.slice(eq + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
})();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { in: 'track-record-passed-bestleg.json', dryRun: true };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--in') opts.in = args[++i];
    else if (args[i] === '--force') opts.dryRun = false;
    else if (args[i] === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

// Map a filtered best-leg candidate to the track_record schema.
function toEntry(c) {
  const leg = c.chosen_leg || 'straddle';
  const legLabel = leg === 'call' ? 'Long call' : leg === 'put' ? 'Long put' : 'ATM straddle';
  const ret = c.leg_realized_return_pct ?? c.estimated_return_pct;
  const result = (c.leg_result || c.result || 'flat').toLowerCase();
  return {
    date: c.date,
    ticker: c.ticker,
    volume_ratio: c.volume_ratio,
    total_value: c.total_value,
    avg_price: c.avg_price,
    result,
    estimated_return_pct: ret,
    hypothetical: true,
    chosen_leg: leg,
    note:
      `[Backtested] ${legLabel} (best as-of historical edge ${c.asof_hit_rate}% over ${c.asof_data_quality} data). ` +
      `Strike $${c.strike_price}, exp ${c.expiration_date}. Entry premium $${c.leg_premium ?? c.total_premium}, ` +
      `underlying closed $${c.expiry_close}. ${result.toUpperCase()} ${ret > 0 ? '+' : ''}${ret}%. ` +
      `Hypothetical — passed KAHF AI's step-forward checks; not live-traded.`
  };
}

async function main() {
  const opts = parseArgs();
  const inPath = path.resolve(ROOT, opts.in);
  const rows = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const entries = rows.map(toEntry);

  console.log(`Loaded ${entries.length} entries from ${opts.in}`);
  console.log(opts.dryRun ? '** DRY RUN — no writes. Pass --force to publish. **\n' : '** LIVE WRITE **\n');

  for (const e of entries) {
    console.log(`  ${e.date}  ${e.ticker.padEnd(6)}  ${e.result.toUpperCase().padEnd(5)} ${e.estimated_return_pct > 0 ? '+' : ''}${e.estimated_return_pct}%  ${e.chosen_leg}`);
  }

  if (opts.dryRun) {
    console.log('\nDry run complete. Re-run with --force (and Firebase admin creds) to publish.');
    return;
  }

  const { isFirebaseAdminConfigured, listTrackRecordEntries, createTrackRecordEntry } = await import(
    '../lib/firebase-admin.js'
  );
  if (!isFirebaseAdminConfigured()) {
    console.error(
      '\nFirebase Admin is NOT configured in this environment.\n' +
        'Set FIREBASE_SERVICE_ACCOUNT_BASE64 (or the KEY / ADMIN_* vars) and retry,\n' +
        'or add these entries via the /admin/wins UI in production.'
    );
    process.exit(1);
  }

  const { entries: existing } = await listTrackRecordEntries({ limit: 500 });
  const seen = new Set((existing || []).map((x) => `${x.date}|${String(x.ticker).toUpperCase()}`));

  let written = 0;
  let skipped = 0;
  for (const e of entries) {
    const key = `${e.date}|${e.ticker.toUpperCase()}`;
    if (seen.has(key)) {
      console.log(`  skip (exists): ${key}`);
      skipped++;
      continue;
    }
    const res = await createTrackRecordEntry(e);
    if (res.success) {
      console.log(`  wrote ${key} → ${res.id}`);
      written++;
    } else {
      console.error(`  FAILED ${key}: ${res.error}`);
    }
  }

  console.log(`\nDone. Wrote ${written}, skipped ${skipped} (already present).`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
