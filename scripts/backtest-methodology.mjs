// Backtests methodology variants on the YTD reads using backtest-data.json
// (collected by collect-backtest-data.mjs). Compares:
//   A  — published baseline (structure as published, hold to expiry)
//   B  — bug fixes: as-of hit rates capped at signal date, 75% cap, 4% straddle floor
//   C* — B + direction gates for calls/puts (DP avg price + sanity checks)
//   D* — best C + straddle-only take-profit/stop-loss grid
// Scoring: $5,000 per read. Settled reads exit at intrinsic (or managed exit);
// open reads marked at last available option close.
// Usage: node scripts/backtest-methodology.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { calculateOverlappingMovements, analyzeOptionsProfitability } = await import('../lib/options-analysis-service.js');
const { calculatePriceMovements } = await import('../lib/polygon-data-service.js');

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'backtest-data.json'), 'utf8'));
const reads = Object.values(data).sort((a, b) => (a.date < b.date ? -1 : 1));
const TODAY = new Date().toISOString().slice(0, 10);
const PER_POSITION = 5000;

const MIN_HIT = 50;
const MAX_HIT = 75;
const MIN_SAMPLES = 10;
const STRADDLE_IMPLIED_FLOOR = 0.04;
const GLOBAL_IMPLIED_FLOOR = 0.02;

// --- Honest as-of hit rates (history capped at signal date) -----------------
const rateCache = new Map();
function asofRates(r) {
  const key = `${r.ticker}__${r.date}`;
  if (rateCache.has(key)) return rateCache.get(key);
  let moves = calculatePriceMovements(r.hist, r.dte);
  if (moves.length < 25) moves = calculateOverlappingMovements(r.hist, r.dte);
  const run = (strategy, premium) => analyzeOptionsProfitability(moves, {
    strategy,
    upperBreakevenPct: premium / r.strike,
    lowerBreakevenPct: -(premium / r.strike)
  });
  const out = {
    call: r.callEntry > 0 ? run('call', r.callEntry) : null,
    put: r.putEntry > 0 ? run('put', r.putEntry) : null,
    straddle: r.callEntry > 0 && r.putEntry > 0 ? run('straddle', r.callEntry + r.putEntry) : null
  };
  rateCache.set(key, out);
  return out;
}

// --- Outcome engine ----------------------------------------------------------
// Returns { returnPct, exit, status } for a structure on a read, with optional
// straddle-only TP/SL management (checked on daily closes, exits at that close).
function outcome(r, structure, mgmt = null) {
  const entry = structure === 'call' ? r.callEntry : structure === 'put' ? r.putEntry : r.callEntry + r.putEntry;
  if (!entry || entry <= 0) return null;

  // Daily value path after the signal date.
  let path;
  if (structure === 'call') path = r.callPath.map((b) => ({ date: b.date, v: b.close }));
  else if (structure === 'put') path = r.putPath.map((b) => ({ date: b.date, v: b.close }));
  else {
    const putByDate = new Map(r.putPath.map((b) => [b.date, b.close]));
    path = r.callPath.filter((b) => putByDate.has(b.date)).map((b) => ({ date: b.date, v: b.close + putByDate.get(b.date) }));
  }
  path = path.filter((p) => p.date <= r.expiration && p.v > 0);

  if (mgmt && structure === 'straddle') {
    for (const p of path) {
      const ret = (p.v - entry) / entry;
      if (mgmt.tp != null && ret >= mgmt.tp) return { returnPct: ret * 100, status: 'managed-tp', exitDate: p.date };
      if (mgmt.sl != null && ret <= -mgmt.sl) return { returnPct: ret * 100, status: 'managed-sl', exitDate: p.date };
    }
  }

  const settled = r.expiration < TODAY;
  if (settled) {
    if (r.expiryClose == null) return null;
    let intrinsic;
    if (structure === 'call') intrinsic = Math.max(r.expiryClose - r.strike, 0);
    else if (structure === 'put') intrinsic = Math.max(r.strike - r.expiryClose, 0);
    else intrinsic = Math.abs(r.expiryClose - r.strike);
    return { returnPct: ((intrinsic - entry) / entry) * 100, status: 'settled' };
  }
  if (path.length === 0) return null;
  const last = path[path.length - 1];
  return { returnPct: ((last.v - entry) / entry) * 100, status: 'open' };
}

// --- Structure selection ------------------------------------------------------
// directionGate(r) -> 'bullish' | 'bearish' | 'neutral'
// mode 'exclude': direction only removes contradicting legs; best rate wins.
// mode 'prefer':  direction picks its leg when it qualifies; straddle/other
//                 legs are fallbacks.
// putFloor: separate (lower) hit-rate floor for direction-confirmed puts.
function selectStructure(r, { fixed, gate, mode = 'exclude', putFloor = MIN_HIT }) {
  if (!fixed) return r.published_structure;

  const implied = r.callEntry > 0 && r.putEntry > 0 ? (r.callEntry + r.putEntry) / r.strike : null;
  if (implied !== null && implied < GLOBAL_IMPLIED_FLOOR) return null; // bad data

  const rates = asofRates(r);
  const dir = gate ? gate(r) : 'neutral';

  const qualifies = (s) => {
    const a = rates[s];
    if (!a || a.totalSamples < MIN_SAMPLES) return false;
    const floor = s === 'put' && dir === 'bearish' ? putFloor : MIN_HIT;
    if (a.profitableRate < floor || a.profitableRate > MAX_HIT) return false;
    if (s === 'straddle' && (implied === null || implied < STRADDLE_IMPLIED_FLOOR)) return false;
    if (s === 'call' && dir === 'bearish') return false;
    if (s === 'put' && dir === 'bullish') return false;
    return true;
  };

  if (mode === 'prefer' && dir !== 'neutral') {
    const preferred = dir === 'bullish' ? 'call' : 'put';
    if (qualifies(preferred)) return preferred;
    if (qualifies('straddle')) return 'straddle';
    return null;
  }

  const legs = ['call', 'put', 'straddle'].filter(qualifies).map((s) => ({ s, rate: rates[s].profitableRate }));
  if (legs.length === 0) return null;
  legs.sort((x, y) => y.rate - x.rate);
  return legs[0].s;
}

// --- Direction gates ------------------------------------------------------------
const gates = {
  none: null,
  // Main indicator only: where did the close settle vs the dark pool prints?
  dpPrice: (r) => {
    if (!r.signalClose || !r.dark_pool_avg_price) return 'neutral';
    return r.signalClose > r.dark_pool_avg_price ? 'bullish' : 'bearish';
  },
  // DP price + at least one price-action sanity check must agree.
  dpPlusSanity: (r) => {
    if (!r.signalClose || !r.dark_pool_avg_price) return 'neutral';
    const dayRet = r.prevClose ? r.signalClose / r.prevClose - 1 : 0;
    const mom5 = r.close5dAgo ? r.signalClose / r.close5dAgo - 1 : 0;
    if (r.signalClose > r.dark_pool_avg_price && (dayRet >= 0 || mom5 >= 0)) return 'bullish';
    if (r.signalClose < r.dark_pool_avg_price && (dayRet <= 0 || mom5 <= 0)) return 'bearish';
    return 'neutral';
  },
  // Strict: DP price + BOTH sanity checks agree.
  dpStrict: (r) => {
    if (!r.signalClose || !r.dark_pool_avg_price) return 'neutral';
    const dayRet = r.prevClose ? r.signalClose / r.prevClose - 1 : 0;
    const mom5 = r.close5dAgo ? r.signalClose / r.close5dAgo - 1 : 0;
    if (r.signalClose > r.dark_pool_avg_price && dayRet >= 0 && mom5 >= 0) return 'bullish';
    if (r.signalClose < r.dark_pool_avg_price && dayRet <= 0 && mom5 <= 0) return 'bearish';
    return 'neutral';
  },
  // Conviction-weighted: direction only enforced on strong signals (>=3.5x);
  // weaker prints stay neutral (hit-rate contest decides alone).
  dpHighConviction: (r) => {
    if (r.volume_ratio < 3.5) return 'neutral';
    return gates.dpPlusSanity(r);
  },
  // DP price primary; sanity checks only demote to neutral when BOTH disagree.
  dpSanityVeto: (r) => {
    if (!r.signalClose || !r.dark_pool_avg_price) return 'neutral';
    const dayRet = r.prevClose ? r.signalClose / r.prevClose - 1 : 0;
    const mom5 = r.close5dAgo ? r.signalClose / r.close5dAgo - 1 : 0;
    if (r.signalClose > r.dark_pool_avg_price) {
      return dayRet < 0 && mom5 < 0 ? 'neutral' : 'bullish';
    }
    return dayRet > 0 && mom5 > 0 ? 'neutral' : 'bearish';
  },
  // Volume ratio as conviction: strong prints (>=3.5x) trust the DP price
  // outright; weaker prints must also survive the sanity veto.
  dpConvictionVeto: (r) => {
    if (r.volume_ratio >= 3.5) return gates.dpPrice(r);
    return gates.dpSanityVeto(r);
  }
};

// --- Run a variant ----------------------------------------------------------------
function runVariant({ name, fixed, gateName = 'none', mgmt = null, mode = 'exclude', putFloor = MIN_HIT }) {
  const rows = [];
  for (const r of reads) {
    const s = selectStructure(r, { fixed, gate: gates[gateName], mode, putFloor });
    if (!s) continue;
    const o = outcome(r, s, mgmt);
    if (!o) continue;
    rows.push({ ...o, structure: s, ticker: r.ticker, date: r.date });
  }
  const wins = rows.filter((x) => x.returnPct > 0);
  const pnl = rows.reduce((s, x) => s + PER_POSITION * (x.returnPct / 100), 0);
  const byStruct = {};
  rows.forEach((x) => (byStruct[x.structure] = (byStruct[x.structure] || 0) + 1));
  return {
    name,
    trades: rows.length,
    winRate: rows.length ? Math.round((100 * wins.length) / rows.length) : 0,
    avgRet: rows.length ? +(rows.reduce((s, x) => s + x.returnPct, 0) / rows.length).toFixed(1) : 0,
    pnl: Math.round(pnl),
    equity: Math.round(100000 + pnl),
    mix: byStruct,
    rows
  };
}

const fmt = (v) => v.toLocaleString('en-US');
function print(v) {
  console.log(
    `${v.name.padEnd(34)} trades ${String(v.trades).padStart(3)}  win ${String(v.winRate).padStart(3)}%  ` +
    `avg ${String(v.avgRet).padStart(7)}%  P/L $${fmt(v.pnl).padStart(9)}  equity $${fmt(v.equity).padStart(8)}  ` +
    JSON.stringify(v.mix)
  );
}

console.log(`Backtest on ${reads.length} YTD reads · $5k per position · marked ${TODAY}\n`);

console.log('--- Baseline & bug fixes ---');
print(runVariant({ name: 'A  published (as on site)', fixed: false }));
print(runVariant({ name: 'B  bug fixes only', fixed: true }));

console.log('\n--- Direction gates (on top of B, exclude mode) ---');
for (const g of ['dpPrice', 'dpPlusSanity', 'dpStrict', 'dpHighConviction', 'dpSanityVeto']) {
  print(runVariant({ name: `C  gate=${g}`, fixed: true, gateName: g }));
}

console.log('\n--- Direction gates (prefer mode: direction picks the leg) ---');
for (const g of ['dpPrice', 'dpPlusSanity', 'dpSanityVeto', 'dpConvictionVeto']) {
  for (const pf of [50, 45, 40]) {
    print(runVariant({ name: `C  prefer ${g} putFloor=${pf}`, fixed: true, gateName: g, mode: 'prefer', putFloor: pf }));
  }
}

console.log('\n--- Straddle TP/SL grid (on each gate) ---');
const grid = [
  { tp: 1.0, sl: 0.5 }, { tp: 0.75, sl: 0.4 }, { tp: 1.5, sl: 0.5 },
  { tp: 0.5, sl: 0.35 }, { tp: 0.4, sl: 0.3 }, { tp: 1.0, sl: null }, { tp: null, sl: 0.5 }
];
const results = [];
for (const mode of ['exclude', 'prefer']) {
  for (const g of ['dpPrice', 'dpPlusSanity', 'dpStrict', 'dpHighConviction', 'dpSanityVeto', 'dpConvictionVeto']) {
    for (const m of grid) {
      const v = runVariant({
        name: `D  ${mode}/${g} + tp${m.tp ?? '—'}/sl${m.sl ?? '—'}`,
        fixed: true, gateName: g, mgmt: m, mode, putFloor: mode === 'prefer' ? 45 : MIN_HIT
      });
      results.push(v);
      print(v);
    }
  }
}

const best = [...results].sort((a, b) => b.equity - a.equity)[0];
console.log(`\n=== BEST MIX: ${best.name} — equity $${fmt(best.equity)} (win ${best.winRate}%, avg ${best.avgRet}%) ===`);
console.log('\nBest-mix trade log:');
for (const t of best.rows.sort((a, b) => (a.date < b.date ? -1 : 1))) {
  console.log(`  ${t.date} ${t.ticker.padEnd(6)} ${t.structure.padEnd(9)} ${String(t.status).padEnd(11)} ${t.returnPct > 0 ? '+' : ''}${t.returnPct.toFixed(1)}%`);
}
