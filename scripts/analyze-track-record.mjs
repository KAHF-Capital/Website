// One-off analysis: marks every track-record read using production logic
// (lib/reads-live.js) and dumps per-structure / per-month / calibration stats.
// Usage: node scripts/analyze-track-record.mjs
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

const { markReads } = await import('../lib/reads-live.js');

const { reads } = JSON.parse(fs.readFileSync(path.join(ROOT, 'track-record-reads.json'), 'utf8'));
console.error(`Marking ${reads.length} reads to market...`);
const { marked, summary } = await markReads(reads);

const scored = marked.filter((r) => r.returnPct !== null);

function stats(rows) {
  const wins = rows.filter((r) => r.returnPct > 0);
  const avg = rows.length ? rows.reduce((s, r) => s + r.returnPct, 0) / rows.length : 0;
  const med = (() => {
    if (!rows.length) return 0;
    const s = [...rows].sort((a, b) => a.returnPct - b.returnPct);
    return s[Math.floor(s.length / 2)].returnPct;
  })();
  return {
    n: rows.length,
    winRate: rows.length ? Math.round((100 * wins.length) / rows.length) : 0,
    avgRet: Number(avg.toFixed(1)),
    medRet: Number(med.toFixed(1)),
    totalRet: Number(rows.reduce((s, r) => s + r.returnPct, 0).toFixed(0))
  };
}

console.log('\n=== OVERALL ===');
console.log(JSON.stringify(summary));

console.log('\n=== BY STRUCTURE (scored only) ===');
for (const s of ['call', 'put', 'straddle']) {
  const rows = scored.filter((r) => r.structure === s);
  console.log(s.padEnd(9), JSON.stringify(stats(rows)));
}

console.log('\n=== BY SIGNAL MONTH (scored only) ===');
const months = [...new Set(scored.map((r) => r.date.slice(0, 7)))].sort();
for (const m of months) {
  const rows = scored.filter((r) => r.date.slice(0, 7) === m);
  const byStruct = {};
  rows.forEach((r) => (byStruct[r.structure] = (byStruct[r.structure] || 0) + 1));
  console.log(m, JSON.stringify(stats(rows)), JSON.stringify(byStruct));
}

console.log('\n=== BY STRUCTURE x MONTH (scored) ===');
for (const m of months) {
  for (const s of ['call', 'put', 'straddle']) {
    const rows = scored.filter((r) => r.date.slice(0, 7) === m && r.structure === s);
    if (rows.length) console.log(m, s.padEnd(9), JSON.stringify(stats(rows)));
  }
}

console.log('\n=== CALIBRATION: asof_hit_rate bucket vs realized win rate (settled only) ===');
const settled = scored.filter((r) => r.status === 'settled');
for (const [lo, hi] of [[50, 55], [55, 60], [60, 65], [65, 75], [75, 91]]) {
  const rows = settled.filter((r) => r.asofHitRate >= lo && r.asofHitRate < hi);
  if (rows.length) console.log(`asof ${lo}-${hi}%:`, JSON.stringify(stats(rows)));
}

console.log('\n=== STRADDLE DETAIL (all, sorted by return) ===');
const straddles = scored.filter((r) => r.structure === 'straddle').sort((a, b) => a.returnPct - b.returnPct);
for (const r of straddles) {
  const bePct = ((r.entryPremium / r.strike) * 100).toFixed(1);
  const moveNeeded = r.status === 'settled' && r.settleClose
    ? ((Math.abs(r.settleClose - r.strike) / r.strike) * 100).toFixed(1)
    : '—';
  console.log(
    `${r.date} ${r.ticker.padEnd(6)} ${String(r.status).padEnd(7)} ret ${String(r.returnPct).padStart(7)}%  ` +
    `BE ±${bePct}%  actualMove ${moveNeeded}%  asof ${r.asofHitRate}%  entry $${r.entryPremium}`
  );
}

console.log('\n=== PUT DETAIL ===');
for (const r of scored.filter((x) => x.structure === 'put')) {
  console.log(`${r.date} ${r.ticker.padEnd(6)} ${r.status.padEnd(7)} ret ${r.returnPct}%  asof ${r.asofHitRate}%`);
}

console.log('\n=== JUNE READS DETAIL ===');
for (const r of scored.filter((x) => x.date.slice(0, 7) === '2026-06').sort((a, b) => a.returnPct - b.returnPct)) {
  console.log(
    `${r.date} ${r.ticker.padEnd(6)} ${r.structure.padEnd(9)} ${r.status.padEnd(7)} ret ${String(r.returnPct).padStart(7)}%  ` +
    `asof ${r.asofHitRate}%  volRatio ${r.volumeRatio}x  exp ${r.expiration}`
  );
}

fs.writeFileSync(path.join(ROOT, 'analysis-marked.json'), JSON.stringify({ marked, summary }, null, 2));
console.error('\nWrote analysis-marked.json');
