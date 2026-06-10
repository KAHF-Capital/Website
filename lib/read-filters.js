// Shared, side-effect-free filters for KAHF AI "reads".
//
// Imported by BOTH the build pipeline (scripts/build-top-reads.js,
// scripts/refresh-track-record.js) and the serving layer (/api/top-reads,
// /api/wins). Keeping it dependency- and side-effect-free means the API routes
// can import it safely (build-top-reads.js itself can't be imported by the API
// because it calls process.exit on a missing POLYGON_API_KEY at load time).

// Manual exclusions — names where the dark-pool/options edge is structurally
// broken (e.g. pending all-cash M&A pins the stock, so historical vol-based hit
// rates are meaningless going forward). The automated veto below now catches
// most of these; this set is the belt-and-suspenders override.
export const EXCLUDED_TICKERS = new Set(['TMHC']);

export function isExcluded(ticker) {
  return EXCLUDED_TICKERS.has(String(ticker || '').toUpperCase());
}

// ---------------------------------------------------------------------------
//  Automated deal / dead-vol veto
// ---------------------------------------------------------------------------
// Buyout signature: a stock that used to move normally gets pinned near the
// announced deal price, so recent realized volatility collapses to near zero —
// while the long-run historical hit rate (computed over ~3y of pre-deal
// history) still looks great. Trading long premium into that is a guaranteed
// slow bleed. We detect the *regime change*: recent realized vol is both
// absolutely tiny AND a small fraction of the longer-run baseline.

export const VETO_DEFAULTS = {
  recentDays: 20, // ~1 trading month of "is it still moving?" evidence
  maxRecentAnnualizedVol: 0.12, // recent realized vol below 12% annualized = effectively pinned
  collapseRatio: 0.5, // ...AND recent vol < 50% of the trailing baseline = a regime change
  minBaselineSamples: 40 // need enough history for the baseline to mean anything
};

// Annualized stdev of daily log returns for a slice of close prices.
function annualizedVol(closes) {
  if (!closes || closes.length < 3) return null;
  const rets = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (prev > 0 && cur > 0) rets.push(Math.log(cur / prev));
  }
  if (rets.length < 2) return null;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/**
 * Decide whether a ticker's volatility regime has collapsed (deal-pin / dead
 * vol) as of the end of `history`. Pure function — caller supplies the daily
 * bars it already fetched.
 *
 * @param {Array<{date:string, close:number}>} history daily bars, any order
 * @param {object} [opts] overrides for VETO_DEFAULTS
 * @returns {{ collapsed: boolean, recentVol: number|null, baseVol: number|null, reason: string|null }}
 */
export function volatilityRegimeCollapsed(history, opts = {}) {
  const o = { ...VETO_DEFAULTS, ...opts };
  const blank = { collapsed: false, recentVol: null, baseVol: null, reason: null };
  if (!Array.isArray(history) || history.length < o.recentDays + o.minBaselineSamples) {
    return blank; // not enough data to judge — don't over-filter
  }

  const sorted = [...history].sort((a, b) => (a.date < b.date ? -1 : 1));
  const closes = sorted.map((h) => h.close).filter((c) => typeof c === 'number' && c > 0);
  if (closes.length < o.recentDays + o.minBaselineSamples) return blank;

  const recentCloses = closes.slice(-o.recentDays);
  const baselineCloses = closes.slice(0, closes.length - o.recentDays);

  const recentVol = annualizedVol(recentCloses);
  const baseVol = annualizedVol(baselineCloses);
  if (recentVol === null || baseVol === null || baseVol === 0) return blank;

  const collapsed =
    recentVol < o.maxRecentAnnualizedVol && recentVol / baseVol < o.collapseRatio;

  return {
    collapsed,
    recentVol: Number(recentVol.toFixed(4)),
    baseVol: Number(baseVol.toFixed(4)),
    reason: collapsed
      ? `vol regime collapse (recent ${(recentVol * 100).toFixed(1)}% annualized vs baseline ${(baseVol * 100).toFixed(1)}%)`
      : null
  };
}
