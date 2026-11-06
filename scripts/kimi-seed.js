#!/usr/bin/env node
// Seed realistic development data for /kimi and /admin/kimi.
//
//   node scripts/kimi-seed.js [--days 56] [--users 46] [--fresh]
//
// Writes to the local dev store (data/kimi-dev-store.json). Refuses to touch
// Firestore. --fresh deletes the dev store first.

import fs from 'fs';
import path from 'path';

function loadKimiEnv() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(KIMI_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  loadKimiEnv();
  if (process.env.KIMI_STORE && process.env.KIMI_STORE !== 'file') throw new Error('Seeding only writes to the local file store. Unset KIMI_STORE.');
  process.env.KIMI_STORE = 'file';
  const { devStoreFile } = await import('../lib/kimi/db.js');
  if (process.argv.includes('--fresh') && fs.existsSync(devStoreFile())) fs.unlinkSync(devStoreFile());
  const { seedKimi } = await import('../lib/kimi/seed.js');
  const started = Date.now();
  console.log(`Seeding Kimi dev data into ${devStoreFile()} ...`);
  const result = await seedKimi({
    days: parseInt(arg('days', '56'), 10),
    userCount: parseInt(arg('users', '46'), 10),
    log: (m) => console.log(m)
  });
  console.log(
    `Done in ${((Date.now() - started) / 1000).toFixed(1)}s: ${result.users} users (${result.verified} verified), ${result.inbound} inbound texts, ${result.alerts} alerts sent, ${result.backtests} backtests, ${result.fromDay} to ${result.toDay}.`
  );
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
