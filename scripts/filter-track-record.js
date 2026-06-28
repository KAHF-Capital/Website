/**
 * filter-track-record.js
 *
 * Applies KAHF AI's "high-conviction" checks to the backtested straddle
 * candidates on a STEP-FORWARD basis — i.e. using only data that would have
 * been knowable on the signal date. No lookahead.
 *
 * The four checks (from the kahf-ai-chat system prompt):
 *   1. Unusual flow      — volume ratio >= 3.0 (today vs 7-day avg)
 *   2. Best-leg edge     — historical hit rate >= 50% with sample >= 25,
 *                          computed using ONLY price history up to the signal
 *                          date (this is the lookahead-free discriminator)
 *   3. Tradeable liquidity — proxy: name cleared the $250M dark-pool bar and
 *                          both straddle legs printed a real trade on/near the
 *                          signal date (true OI/spread history isn't available
 *                          on the Options Basic plan)
 *   4. Catalyst alignment — NOT auto-verifiable point-in-time without
 *                          lookahead-prone historical news. For a straddle
 *                          (direction-agnostic) the alignment sub-rule is moot;
 *                          we flag this check as "manual" rather than fake-pass.
 *
 * Usage:
 *   node scripts/filter-track-record.js \
 *     --in track-record-candidates.json \
 *     --out track-record-passed.json \
 *     [--min-hit-rate 55] [--min-samples 25] [--min-vol-ratio 3.0]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load .env.local BEFORE importing modules that read process.env at load time
// (polygon-data-service captures POLYGON_API_KEY into a const on import).
(function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
})();

// Dynamic imports so the env load above runs first.
const { calculateOverlappingMovements, analyzeOptionsProfitability } = await import(
  '../lib/options-analysis-service.js'
);
const { getHistoricalStockData } = await import('../lib/polygon-data-service.js');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    in: 'track-record-candidates.json',
    out: 'track-record-passed.json',
    minHitRate: 50,
    maxHitRate: 90, // above this is almost always a stale/illiquid-pricing artifact
    minSamples: 25,
    minVolRatio: 3.0,
    minHistoryDays: 400 // require ~1.5y of real history (kills thin/recently-listed names)
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--in') opts.in = args[++i];
    else if (a === '--out') opts.out = args[++i];
    else if (a === '--min-hit-rate') opts.minHitRate = parseFloat(args[++i]);
    else if (a === '--min-samples') opts.minSamples = parseInt(args[++i], 10);
    else if (a === '--min-vol-ratio') opts.minVolRatio = parseFloat(args[++i]);
    else if (a === '--min-history-days') opts.minHistoryDays = parseInt(args[++i], 10);
  }
  return opts;
}

// Subtract calendar days from a YYYY-MM-DD date string.
function minusDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Step-forward hit rates for ALL THREE legs using ONLY history before the
// signal date. One history fetch, three breakeven evaluations.
async function asOfLegHitRates(ticker, signalDate, strikePrice, premiums, dte) {
  const MIN_PERIODS = 25;
  const calendarDaysNeeded = Math.max(750, Math.ceil((MIN_PERIODS * dte) / 0.7) + 60);
  const from = minusDays(signalDate, calendarDaysNeeded);
  const to = signalDate; // hard cutoff — nothing after the signal is visible

  const history = await getHistoricalStockData(ticker, from, to);
  const clean = history.filter((h) => h.date <= signalDate);
  const movements = calculateOverlappingMovements(clean, dte);

  const run = (strategy, premium) => {
    const beUpperPct = premium / strikePrice;
    const beLowerPct = -(premium / strikePrice);
    const a = analyzeOptionsProfitability(movements, {
      strategy,
      upperBreakevenPct: beUpperPct,
      lowerBreakevenPct: beLowerPct
    });
    return { hitRate: a.profitableRate, samples: a.totalSamples, dataQuality: a.dataQuality };
  };

  return {
    call: run('call', premiums.call),
    put: run('put', premiums.put),
    straddle: run('straddle', premiums.straddle),
    historyFrom: clean[0]?.date || null,
    historyTo: clean[clean.length - 1]?.date || null
  };
}

// Realized P/L for a single leg held to expiry, from data we already have.
function realizedLegReturn(strategy, c) {
  const strike = c.strike_price;
  const close = c.expiry_close;
  if (strategy === 'call') {
    const prem = c.call_premium;
    const intrinsic = Math.max(close - strike, 0);
    return { premium: prem, intrinsic, returnPct: prem > 0 ? ((intrinsic - prem) / prem) * 100 : 0 };
  }
  if (strategy === 'put') {
    const prem = c.put_premium;
    const intrinsic = Math.max(strike - close, 0);
    return { premium: prem, intrinsic, returnPct: prem > 0 ? ((intrinsic - prem) / prem) * 100 : 0 };
  }
  // straddle — already computed in the candidate
  return { premium: c.total_premium, intrinsic: Math.abs(close - strike), returnPct: c.estimated_return_pct };
}

async function main() {
  const opts = parseArgs();
  const inPath = path.resolve(ROOT, opts.in);
  const outPath = path.resolve(ROOT, opts.out);

  const candidates = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  console.error(`Loaded ${candidates.length} candidates from ${opts.in}`);
  console.error(
    `Step-forward gate: vol ratio >= ${opts.minVolRatio}, as-of hit rate >= ${opts.minHitRate}% (samples >= ${opts.minSamples})\n`
  );

  const passedStraddle = []; // straddle-only interpretation
  const passedBestLeg = []; // best-leg interpretation (matches the product)
  const failed = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const dte = c.dte_actual || 30;
    const tag = `${c.date} ${c.ticker}`;

    // Check 1 — unusual flow (already known at signal date)
    const check1 = (c.volume_ratio || 0) >= opts.minVolRatio;
    // Check 3 — liquidity proxy (known at signal date)
    const legsPrinted = (c.call_premium || 0) > 0 && (c.put_premium || 0) > 0;
    const clearedDollarBar = (c.total_value || 0) >= 250_000_000;
    const check3 = legsPrinted && clearedDollarBar;

    // Check 2 — step-forward historical hit rates for all three legs
    let asOf;
    try {
      asOf = await asOfLegHitRates(
        c.ticker,
        c.date,
        c.strike_price,
        { call: c.call_premium, put: c.put_premium, straddle: c.total_premium },
        dte
      );
    } catch (err) {
      failed.push({ ...c, fail_reason: `as-of hit rate error: ${err.message}` });
      console.error(`  ✗ ${i + 1}/${candidates.length}  ${tag.padEnd(18)}  ERROR ${err.message}`);
      continue;
    }

    // Data-quality floor: require enough REAL calendar history before the signal
    // (overlapping-window sample counts can look big even on thin history).
    const historySpanDays = asOf.historyFrom
      ? Math.round((new Date(c.date) - new Date(asOf.historyFrom)) / (24 * 60 * 60 * 1000))
      : 0;
    const enoughHistory = historySpanDays >= opts.minHistoryDays;

    // Pick the best leg by as-of hit rate among legs with enough samples.
    const legChoices = ['call', 'put', 'straddle']
      .map((s) => ({ strategy: s, ...asOf[s] }))
      .filter((l) => l.samples >= opts.minSamples)
      .sort((a, b) => b.hitRate - a.hitRate);
    const best = legChoices[0] || null;

    const straddlePass = check1 && check3 && enoughHistory && asOf.straddle.hitRate >= opts.minHitRate && asOf.straddle.hitRate <= opts.maxHitRate && asOf.straddle.samples >= opts.minSamples;
    const bestLegPass = check1 && check3 && enoughHistory && best && best.hitRate >= opts.minHitRate && best.hitRate <= opts.maxHitRate;

    // --- straddle-only record ---
    if (straddlePass) {
      passedStraddle.push({
        ...c,
        asof_hit_rate: Number(asOf.straddle.hitRate.toFixed(1)),
        asof_samples: asOf.straddle.samples,
        asof_data_quality: asOf.straddle.dataQuality
      });
    }

    // --- best-leg record (realize the leg the AI would have picked) ---
    let bestLegLine = '';
    if (bestLegPass) {
      const realized = realizedLegReturn(best.strategy, c);
      const win = realized.returnPct > 0;
      passedBestLeg.push({
        ...c,
        chosen_leg: best.strategy,
        asof_hit_rate: Number(best.hitRate.toFixed(1)),
        asof_samples: best.samples,
        asof_data_quality: best.dataQuality,
        leg_premium: Number((realized.premium || 0).toFixed(2)),
        leg_realized_return_pct: Number(realized.returnPct.toFixed(1)),
        leg_result: win ? 'WIN' : 'LOSS',
        checks: {
          unusual_flow: check1,
          stepforward_edge: true,
          liquidity_proxy: check3,
          catalyst_alignment: 'manual'
        }
      });
      bestLegLine = `BEST=${best.strategy} ${best.hitRate.toFixed(1)}% → ${win ? 'WIN' : 'LOSS'} ${realized.returnPct > 0 ? '+' : ''}${realized.returnPct.toFixed(1)}%`;
    }

    if (straddlePass || bestLegPass) {
      console.error(
        `  ✓ ${i + 1}/${candidates.length}  ${tag.padEnd(18)}  C=${asOf.call.hitRate.toFixed(0)}% P=${asOf.put.hitRate.toFixed(0)}% S=${asOf.straddle.hitRate.toFixed(0)}%  ${bestLegLine}`
      );
    } else {
      const reasons = [];
      if (!check1) reasons.push(`vol ratio ${(c.volume_ratio || 0).toFixed(2)} < ${opts.minVolRatio}`);
      if (!check3) reasons.push('liquidity proxy failed');
      if (!enoughHistory) reasons.push(`thin history (${historySpanDays}d < ${opts.minHistoryDays}d)`);
      if (!best || best.hitRate < opts.minHitRate)
        reasons.push(`best leg as-of ${best ? best.hitRate.toFixed(1) : 'n/a'}% < ${opts.minHitRate}%`);
      failed.push({ ...c, fail_reason: reasons.join('; ') });
      console.error(
        `  ·   ${i + 1}/${candidates.length}  ${tag.padEnd(18)}  C=${asOf.call.hitRate.toFixed(0)}% P=${asOf.put.hitRate.toFixed(0)}% S=${asOf.straddle.hitRate.toFixed(0)}%  SKIP`
      );
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(passedStraddle, null, 2));
  fs.writeFileSync(outPath.replace(/\.json$/, '-bestleg.json'), JSON.stringify(passedBestLeg, null, 2));
  fs.writeFileSync(outPath.replace(/\.json$/, '-failed.json'), JSON.stringify(failed, null, 2));

  const summarize = (arr, retKey, resKey) => {
    const wins = arr.filter((p) => p[resKey] === 'WIN').length;
    const avg = arr.length ? arr.reduce((s, p) => s + (p[retKey] || 0), 0) / arr.length : 0;
    return { n: arr.length, wins, losses: arr.length - wins, rate: arr.length ? (wins / arr.length) * 100 : 0, avg };
  };
  const sStr = summarize(passedStraddle, 'estimated_return_pct', 'result');
  const sBest = summarize(passedBestLeg, 'leg_realized_return_pct', 'leg_result');

  console.error('\n========================================');
  console.error(`Candidates evaluated: ${candidates.length}  (gate: vol>=${opts.minVolRatio}, as-of hit>=${opts.minHitRate}%, n>=${opts.minSamples})`);
  console.error('--- STRADDLE-ONLY (straddle hit rate must clear the gate) ---');
  console.error(`  Passed: ${sStr.n}  |  ${sStr.wins}W/${sStr.losses}L  realized ${sStr.rate.toFixed(1)}%  avg ${sStr.avg > 0 ? '+' : ''}${sStr.avg.toFixed(1)}%`);
  console.error('--- BEST-LEG (AI picks best of call/put/straddle as-of date) ---');
  console.error(`  Passed: ${sBest.n}  |  ${sBest.wins}W/${sBest.losses}L  realized ${sBest.rate.toFixed(1)}%  avg ${sBest.avg > 0 ? '+' : ''}${sBest.avg.toFixed(1)}%`);
  console.error('========================================');
  console.error(`Wrote straddle-only → ${opts.out}`);
  console.error(`Wrote best-leg     → ${opts.out.replace(/\.json$/, '-bestleg.json')}`);
  console.error('\nNote: Check 4 (catalyst alignment) is flagged "manual" — not auto-verifiable point-in-time.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
