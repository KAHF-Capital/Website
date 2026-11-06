// Conversational backtesting on KAHF's existing backtest API.
//
// Each structure runs through the backend exactly as /api/options-best-strategy
// does: a live ATM quote (getOptionsQuote) feeds runHistoricalAnalysis, which
// supplies the trade count and win rate. Kimi derives average return, drawdown,
// Sharpe, the equity curve and the trade list from the same N-day windows with
// hold-to-expiry payoffs, and only shows them when they reproduce the backend's
// own sample and win counts exactly.
//
// Jobs are asynchronous: submit -> acknowledge -> run in the background ->
// text (or post to web chat) the top-3 comparison with a caveat and a link.

import { KIMI_CONFIG } from './kimi.config.js';
import { backend, signalIdOf } from './backend.js';
import { addDays, usageDay, clockNow } from './runtime.js';
import {
  appendMessage,
  createBacktest,
  createShortLink,
  emitEvent,
  getAlert,
  getBacktest,
  getDelivery,
  getProfile,
  markUserActivity,
  profilePhone,
  queryBacktests,
  updateBacktest,
  updateBacktestIf,
  updateDeliveryIf
} from './store.js';
import { sendKimiMessage } from './messaging/index.js';

const CFG = KIMI_CONFIG.backtests;

export class BacktestRequestError extends Error {
  constructor(message, code = 'INVALID_REQUEST') {
    super(message);
    this.code = code;
    this.userFacing = true;
  }
}

export const RANK_LABELS = { sharpe: 'Sharpe', win_rate: 'win rate', avg_return: 'avg return', max_drawdown: 'max drawdown' };

export const BACKTEST_REQUEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ticker: { type: 'string', description: 'Underlying symbol, e.g. "NVDA". Optional when alert_id is given.' },
    structures: {
      type: 'array',
      items: { type: 'string', enum: backend().structures },
      description: `Structures to compare. Default: ${CFG.defaultStructures.join(', ')}.`
    },
    days_to_expiration: {
      type: 'integer',
      minimum: CFG.minDaysToExpiration,
      maximum: CFG.maxDaysToExpiration,
      description: `Target days to expiration of the ATM contract; also the holding window. Default ${CFG.defaultDaysToExpiration}.`
    },
    as_of_date: { type: 'string', description: 'YYYY-MM-DD. Price history stops on this date (no lookahead). Default: today.' },
    rank_by: { type: 'string', enum: CFG.rankMetrics, description: 'Ranking metric. Default sharpe.' },
    alert_id: { type: 'string', description: 'Backtest the setup from an alert Kimi sent this user (ticker, holding window and history cutoff come from the backend signal).' }
  }
};

// What runHistoricalAnalysis accepts and returns (lib/options-analysis-service.js).
export const BACKEND_BACKTEST_API = {
  function: 'runHistoricalAnalysis (lib/options-analysis-service.js), also POST /api/options-analysis',
  config: {
    ticker: 'string',
    strategy: backend().structures.join(' | '),
    strikePrice: 'number, ATM strike from getOptionsQuote',
    premium: 'number, live ATM mid (straddle = call + put)',
    daysToExpiration: 'integer, days to the quoted expiration',
    asOfDate: 'YYYY-MM-DD history cutoff, optional'
  },
  returns: ['totalSamples', 'profitableRate', 'totalProfitable', 'avgMove', 'maxMove', 'avgUpMove', 'avgDownMove', 'breakevens', 'dataQuality', 'historyYears'],
  execution: 'synchronous; Kimi wraps each run in a job and reports completion itself'
};

function round(n, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function todayIso(now = clockNow()) {
  return usageDay(now);
}

export function validateBacktestRequest(raw = {}, now = clockNow()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BacktestRequestError('Backtest request must be an object.');
  const allowed = Object.keys(BACKTEST_REQUEST_SCHEMA.properties);
  const unknown = Object.keys(raw).filter((k) => !allowed.includes(k));
  if (unknown.length) throw new BacktestRequestError(`Unsupported field(s): ${unknown.join(', ')}. Supported: ${allowed.join(', ')}.`, 'UNSUPPORTED_FIELD');

  const ticker = raw.ticker ? String(raw.ticker).replace(/^\$/, '').trim().toUpperCase() : null;
  if (ticker && !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) throw new BacktestRequestError(`"${raw.ticker}" isn't a valid ticker.`, 'INVALID_TICKER');

  const supported = backend().structures;
  let structures = Array.isArray(raw.structures) && raw.structures.length ? raw.structures.map((s) => String(s).toLowerCase().trim()) : [...CFG.defaultStructures];
  const bad = structures.filter((s) => !supported.includes(s));
  if (bad.length) throw new BacktestRequestError(`Unsupported structure(s): ${bad.join(', ')}. Supported: ${supported.join(', ')}.`, 'UNSUPPORTED_STRUCTURE');
  structures = [...new Set(structures)];

  let dte = CFG.defaultDaysToExpiration;
  if (raw.days_to_expiration !== undefined && raw.days_to_expiration !== null) {
    dte = parseInt(raw.days_to_expiration, 10);
    if (!Number.isFinite(dte) || dte < CFG.minDaysToExpiration || dte > CFG.maxDaysToExpiration) {
      throw new BacktestRequestError(`days_to_expiration must be ${CFG.minDaysToExpiration}-${CFG.maxDaysToExpiration}.`, 'INVALID_DTE');
    }
  }

  let asOf = null;
  if (raw.as_of_date) {
    asOf = String(raw.as_of_date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`))) {
      throw new BacktestRequestError('as_of_date must be YYYY-MM-DD.', 'INVALID_DATE');
    }
    if (asOf > todayIso(now)) throw new BacktestRequestError('as_of_date cannot be in the future.', 'INVALID_DATE');
  }

  const rankBy = raw.rank_by ? String(raw.rank_by).toLowerCase() : CFG.defaultRankBy;
  if (!CFG.rankMetrics.includes(rankBy)) throw new BacktestRequestError(`rank_by must be one of ${CFG.rankMetrics.join(', ')}.`, 'INVALID_RANK');

  return {
    ticker,
    structures,
    days_to_expiration: dte,
    as_of_date: asOf,
    rank_by: rankBy,
    alert_id: raw.alert_id ? String(raw.alert_id) : null
  };
}

export function listStructures() {
  const b = backend();
  return {
    structures: b.structures.map((id) => ({
      id,
      label: b.structureLabel(id),
      payoff:
        id === 'call'
          ? 'Long ATM call held to expiration'
          : id === 'put'
            ? 'Long ATM put held to expiration'
            : 'Long ATM call + put held to expiration'
    })),
    request_schema: BACKTEST_REQUEST_SCHEMA,
    backend_api: BACKEND_BACKTEST_API,
    rank_metrics: CFG.rankMetrics,
    defaults: { structures: CFG.defaultStructures, days_to_expiration: CFG.defaultDaysToExpiration, rank_by: CFG.defaultRankBy }
  };
}

export function historySinceYear({ days_to_expiration: dte, as_of_date: asOf }, now = clockNow()) {
  const end = asOf || todayIso(now);
  const calendarDays = Math.max(750, Math.ceil((25 * dte) / 0.7) + 60);
  return new Date(new Date(`${end}T12:00:00Z`).getTime() - calendarDays * 86400000).getUTCFullYear();
}

function describeStructures(structures) {
  if (structures.length === 1) return backend().structureLabel(structures[0]);
  return `${structures.length} structures`;
}

function formatEstimate(seconds) {
  if (seconds < 60) return `~${Math.max(5, Math.round(seconds / 5) * 5)}s`;
  return `~${Math.round(seconds / 60)} min`;
}

async function estimateRuntimeSeconds() {
  const recent = (await queryBacktests({ status: 'completed' })).slice(0, 20).map((j) => j.runtime_ms).filter((n) => n > 0);
  if (recent.length < 3) return CFG.defaultEstimatedSeconds;
  recent.sort((a, b) => a - b);
  return Math.ceil(recent[Math.floor(recent.length / 2)] / 1000) + 5;
}

async function enforceLimits(userId, now) {
  const jobs = await queryBacktests({ userId });
  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  if (active.length >= CFG.maxConcurrentPerUser) {
    throw new BacktestRequestError(
      `You already have ${active.length} backtest${active.length === 1 ? '' : 's'} running. I'll text the results; send the next one after they land.`,
      'CONCURRENCY_LIMIT'
    );
  }
  const today = usageDay(now);
  const used = jobs.filter((j) => j.status !== 'failed' && usageDay(new Date(j.created_at)) === today).length;
  if (used >= CFG.dailyCapPerUser) {
    throw new BacktestRequestError(`You've used today's ${CFG.dailyCapPerUser} backtests. The limit resets at midnight ET.`, 'DAILY_LIMIT');
  }
}

/**
 * Validate, authorize and enqueue a backtest. Returns the job and the
 * acknowledgement text. Call runBacktestJob(job.id) afterwards.
 */
export async function submitBacktest({ userId, request, source = 'free_form', channel = 'web', provider = null, now = clockNow() }) {
  if (!userId) throw new BacktestRequestError('Sign in required.', 'UNAUTHORIZED');
  const req = validateBacktestRequest(request, now);
  let alert = null;
  if (req.alert_id) {
    const delivery = await getDelivery(req.alert_id, userId);
    if (!delivery || !['sent', 'delivered'].includes(delivery.status)) {
      throw new BacktestRequestError('That alert was not sent to you.', 'FORBIDDEN');
    }
    alert = await getAlert(req.alert_id);
    if (!alert) throw new BacktestRequestError('That alert no longer exists.', 'NOT_FOUND');
    const signal = alert.signal_payload || {};
    if (req.ticker && req.ticker !== alert.ticker) throw new BacktestRequestError(`That alert is for $${alert.ticker}, not $${req.ticker}.`);
    req.ticker = alert.ticker;
    if (request.days_to_expiration === undefined && Number.isFinite(signal.dte)) {
      req.days_to_expiration = Math.min(CFG.maxDaysToExpiration, Math.max(CFG.minDaysToExpiration, Math.round(signal.dte)));
    }
    if (!request.as_of_date && /^\d{4}-\d{2}-\d{2}$/.test(signal.date || '')) req.as_of_date = signal.date;
    source = 'alert';
  }
  if (!req.ticker) throw new BacktestRequestError('Which ticker? Try "BT $NVDA".', 'MISSING_TICKER');

  try {
    await enforceLimits(userId, now);
  } catch (err) {
    await emitEvent('backtest_limited', { userId, channel, ticker: req.ticker, properties: { code: err.code } });
    throw err;
  }

  const signal = alert?.signal_payload || {};
  const job = await createBacktest({
    user_id: userId,
    source,
    alert_id: alert?.id || null,
    ticker: req.ticker,
    request: req,
    rank_by: req.rank_by,
    structures: req.structures,
    status: 'queued',
    signal_reference: alert
      ? {
          backend_signal_id: alert.backend_signal_id,
          backend_param_version: alert.backend_param_version || null,
          signal_date: signal.date || null,
          published_structure: signal.structure || null,
          published_entry_premium: signal.entry_premium ?? null,
          published_hit_rate: signal.asof_hit_rate ?? null
        }
      : null,
    notify: { channel, provider: provider && typeof provider === 'object' ? provider.name : provider || null },
    created_at: now.toISOString()
  });

  await markUserActivity(userId, { at: now.toISOString(), kind: 'backtest' });
  await emitEvent('backtest_requested', {
    userId,
    channel,
    ticker: req.ticker,
    at: now,
    properties: { job_id: job.id, source, alert_id: job.alert_id, structures: req.structures, rank_by: req.rank_by, days_to_expiration: req.days_to_expiration, as_of_date: req.as_of_date }
  });
  if (alert) {
    await updateDeliveryIf(alert.id, userId, (d) => d && !d.backtest_at, { backtest_at: now.toISOString(), backtest_job_id: job.id });
  }

  const estimateSeconds = await estimateRuntimeSeconds();
  const ack = KIMI_CONFIG.templates.backtestAck({
    ticker: req.ticker,
    structures: describeStructures(req.structures),
    dte: req.days_to_expiration,
    sinceYear: historySinceYear(req, now),
    estimate: formatEstimate(estimateSeconds)
  });
  return { job, ack, estimateSeconds };
}

export function structurePayoff(structure, move, premiumRatio) {
  if (structure === 'call') return (Math.max(move, 0) - premiumRatio) / premiumRatio;
  if (structure === 'put') return (Math.max(-move, 0) - premiumRatio) / premiumRatio;
  return (Math.abs(move) - premiumRatio) / premiumRatio;
}

/**
 * Hold-to-expiry returns per backend window. Windows come from
 * calculatePriceMovements, where `endDate` is the earlier (entry) date.
 */
export function deriveMetrics({ structure, windows, premium, strike, dte, startingEquity = CFG.startingEquityUsd, positionSize = CFG.positionSizeUsd }) {
  const p = premium / strike;
  const trades = windows
    .map((w) => ({
      entry_date: w.endDate,
      exit_date: w.startDate,
      entry_close: round(w.endPrice, 2),
      exit_close: round(w.startPrice, 2),
      move: w.percentMove
    }))
    .sort((a, b) => (a.exit_date < b.exit_date ? -1 : a.exit_date > b.exit_date ? 1 : 0));

  const returns = trades.map((t) => structurePayoff(structure, t.move, p));
  const n = returns.length;
  const wins = returns.filter((r) => r > 0).length;
  if (n === 0) {
    return { trades: 0, wins: 0, avg_return: null, median_return: null, max_drawdown: null, sharpe: null, total_pnl_usd: null, final_equity: null, best_return: null, worst_return: null, equity_curve: [], trade_list: [] };
  }
  const mean = returns.reduce((s, r) => s + r, 0) / n;
  const sorted = [...returns].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const sd = n > 1 ? Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1)) : 0;
  const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(252 / dte) : null;

  let equity = startingEquity;
  let peak = equity;
  let maxDd = 0;
  const curve = [{ date: trades[0].entry_date, equity: Math.round(equity) }];
  trades.forEach((t, i) => {
    equity += positionSize * returns[i];
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, (equity - peak) / peak);
    curve.push({ date: t.exit_date, equity: Math.round(equity) });
  });

  const tradeList = trades
    .map((t, i) => ({
      entry_date: t.entry_date,
      exit_date: t.exit_date,
      entry_close: t.entry_close,
      exit_close: t.exit_close,
      move_pct: round(t.move * 100, 2),
      return_pct: round(returns[i] * 100, 1),
      pnl_usd: Math.round(positionSize * returns[i]),
      result: returns[i] > 0 ? 'win' : 'loss'
    }))
    .reverse();

  return {
    trades: n,
    wins,
    avg_return: round(mean * 100, 1),
    median_return: round(median * 100, 1),
    max_drawdown: round(maxDd * 100, 1),
    sharpe: sharpe === null ? null : round(sharpe, 2),
    total_pnl_usd: Math.round(equity - startingEquity),
    final_equity: Math.round(equity),
    best_return: round(sorted[n - 1] * 100, 1),
    worst_return: round(sorted[0] * 100, 1),
    equity_curve: curve,
    trade_list: tradeList
  };
}

class BacktestRunError extends Error {
  constructor(message, code = 'BACKTEST_FAILED') {
    super(message);
    this.code = code;
  }
}

async function evaluateStructure({ ticker, structure, dte, asOfDate, now }) {
  const b = backend();
  const label = b.structureLabel(structure);
  const targetExpiration = addDays(todayIso(now), dte);
  const quote = await b.getLiveOptionQuote(ticker, targetExpiration, structure).catch((err) => {
    throw new BacktestRunError(`couldn't get a live ${label.toLowerCase()} quote for $${ticker} (${err.message}).`, 'NO_QUOTE');
  });
  if (!quote || !(quote.premium > 0) || !(quote.strikePrice > 0)) {
    throw new BacktestRunError(`no live ${label.toLowerCase()} quote for $${ticker}.`, 'NO_QUOTE');
  }
  const daysToExpiration = Math.max(1, Math.ceil((new Date(quote.expiration) - now) / 86400000));
  const config = {
    ticker,
    strategy: structure,
    strikePrice: quote.strikePrice,
    premium: Number(quote.premium),
    daysToExpiration,
    ...(asOfDate ? { asOfDate } : {})
  };
  const analysis = await b.runStructureBacktest(config).catch((err) => {
    throw new BacktestRunError(`the backtest API rejected $${ticker} ${label.toLowerCase()} (${err.message}).`, 'BACKEND_ERROR');
  });
  if (!analysis || !(analysis.totalSamples > 0)) {
    throw new BacktestRunError(`not enough price history for $${ticker}.`, 'NO_HISTORY');
  }

  let derived = null;
  let windowsInfo = null;
  try {
    windowsInfo = await b.getAnalysisWindows({ ticker, daysToExpiration, asOfDate });
    derived = deriveMetrics({ structure, windows: windowsInfo.windows, premium: config.premium, strike: config.strikePrice, dte: daysToExpiration });
  } catch (err) {
    console.warn(`[kimi/backtests] derived metrics unavailable for ${ticker} ${structure}: ${err.message}`);
  }
  const consistent = Boolean(derived && derived.trades === analysis.totalSamples && derived.wins === analysis.totalProfitable);

  return {
    structure,
    label,
    backend_config: config,
    quote: {
      strike: quote.strikePrice,
      premium: round(Number(quote.premium), 2),
      expiration: quote.expiration,
      days_to_expiration: daysToExpiration,
      spot: quote.currentPrice ?? null,
      call_price: quote.callPrice ?? null,
      put_price: quote.putPrice ?? null,
      quoted_at: now.toISOString()
    },
    backend: {
      total_samples: analysis.totalSamples,
      total_profitable: analysis.totalProfitable,
      profitable_rate: round(analysis.profitableRate, 1),
      avg_move_pct: round(analysis.avgMove, 2),
      max_move_pct: round(analysis.maxMove, 2),
      avg_up_move_pct: round(analysis.avgUpMove, 2),
      avg_down_move_pct: round(analysis.avgDownMove, 2),
      breakevens: analysis.breakevens || null,
      data_quality: analysis.dataQuality || null,
      history_years: analysis.historyYears ?? null,
      history_as_of: analysis.historyAsOf || null
    },
    trades: analysis.totalSamples,
    win_rate: round(analysis.profitableRate, 1),
    avg_return: consistent ? derived.avg_return : null,
    median_return: consistent ? derived.median_return : null,
    max_drawdown: consistent ? derived.max_drawdown : null,
    sharpe: consistent ? derived.sharpe : null,
    total_pnl_usd: consistent ? derived.total_pnl_usd : null,
    final_equity: consistent ? derived.final_equity : null,
    best_return: consistent ? derived.best_return : null,
    worst_return: consistent ? derived.worst_return : null,
    equity_curve: consistent ? derived.equity_curve : [],
    trade_list: consistent ? derived.trade_list.slice(0, 80) : [],
    derived_metrics_verified: consistent,
    overlapping_windows: Boolean(windowsInfo?.overlapping),
    history_start: windowsInfo?.historyStart || null,
    history_end: windowsInfo?.historyEnd || analysis.historyAsOf || null
  };
}

export function rankResults(results, rankBy = CFG.defaultRankBy) {
  const key = CFG.rankMetrics.includes(rankBy) ? rankBy : CFG.defaultRankBy;
  const value = (r, k) => (r[k] === null || r[k] === undefined ? -Infinity : r[k]);
  return [...results]
    .sort((a, b) => value(b, key) - value(a, key) || value(b, 'sharpe') - value(a, 'sharpe') || value(b, 'win_rate') - value(a, 'win_rate'))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export function backtestCaveats(ranked, job, now = clockNow()) {
  const minTrades = Math.min(...ranked.map((r) => r.trades || 0));
  const caveats = [];
  if (ranked.some((r) => r.overlapping_windows)) caveats.push(`Short history, so the ${minTrades} windows overlap and aren't independent.`);
  if (minTrades < CFG.smallSampleThreshold) caveats.push(`Small sample: ${minTrades} windows.`);
  const signalDate = job.signal_reference?.signal_date;
  if (signalDate && (now - new Date(`${signalDate}T21:00:00Z`)) / 86400000 > 5) {
    caveats.push('History stops at the signal date but premiums are today\'s quotes.');
  }
  caveats.push('Applies today\'s premium to every past window, so it assumes implied vol was the same back then.');
  caveats.push('Held to expiration with no commissions or slippage.');
  caveats.push('Regime-dependent: results reflect the last few years of price action only.');
  return caveats;
}

export function formatComparisonText({ ticker, ranked, rankBy, caveat }) {
  const short = (s) => (s === 'call' ? 'Call' : s === 'put' ? 'Put' : 'Straddle');
  const signed = (n) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
  const rows = ranked.slice(0, 3).map((r, i) => {
    const bits = [`${r.trades} trades`, `${Math.round(r.win_rate)}% win`];
    if (r.avg_return !== null) bits.push(`${signed(r.avg_return)} avg`);
    if (r.max_drawdown !== null) bits.push(`${Math.round(r.max_drawdown)}% max DD`);
    if (r.sharpe !== null) bits.push(`Sharpe ${r.sharpe.toFixed(2)}`);
    return `${i + 1}) ${short(r.structure)}: ${bits.join(', ')}`;
  });
  return `$${ticker} by ${RANK_LABELS[rankBy] || 'Sharpe'}: ${rows.join('. ')}. Caveat: ${caveat} ${KIMI_CONFIG.disclaimers.backtestSummary}`;
}

function plainError(err) {
  const msg = String(err?.message || 'something went wrong on the backtest service.').trim();
  return /[.!?]$/.test(msg) ? msg : `${msg}.`;
}

async function loadSignalHistory(ticker, reference) {
  const feeds = await backend().loadPublishedSignals();
  const reads = feeds.signals
    .map((s) => s.read)
    .filter((r) => String(r.ticker).toUpperCase() === ticker)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 8);
  const marked = await Promise.all(reads.map((r) => backend().markSignal(r).catch(() => null)));
  return reads.map((r, i) => ({
    backend_signal_id: signalIdOf(r),
    date: r.date,
    structure: r.structure || null,
    label: r.structure ? backend().structureLabel(r.structure) : null,
    entry_premium: r.entry_premium ?? null,
    hit_rate: r.asof_hit_rate ?? null,
    status: marked[i]?.status || null,
    return_pct: marked[i]?.returnPct ?? null,
    is_this_signal: signalIdOf(r) === reference.backend_signal_id
  }));
}

async function notifyUser(job, text, { linkUrl = null, kind = 'backtest' } = {}) {
  const channel = job.notify?.channel || 'web';
  if (channel !== 'web') {
    const profile = await getProfile(job.user_id);
    const phone = profilePhone(profile);
    if (phone && profile.sms_enabled) {
      await sendKimiMessage({
        userId: job.user_id,
        to: phone,
        text,
        linkUrl,
        kind,
        provider: job.notify?.provider || null,
        channel: null,
        relatedBacktestId: job.id,
        relatedAlertId: job.alert_id || null,
        maxChars: 480,
        profile
      });
      return;
    }
  }
  await appendMessage({
    user_id: job.user_id,
    direction: 'outbound',
    channel: 'web',
    provider: 'web',
    body: linkUrl ? `${text} ${linkUrl}` : text,
    kind,
    related_backtest_id: job.id,
    related_alert_id: job.alert_id || null
  });
}

/** Run a queued job to completion and notify the user. Safe to call twice. */
export async function runBacktestJob(jobId, { now = clockNow() } = {}) {
  const claim = await updateBacktestIf(jobId, (j) => j && j.status === 'queued', { status: 'running', started_at: clockNow().toISOString() });
  if (!claim.updated) return claim.doc;
  const job = claim.doc;
  const req = job.request;
  const started = clockNow().getTime();
  try {
    const settled = await Promise.all(
      req.structures.map((structure) =>
        evaluateStructure({ ticker: req.ticker, structure, dte: req.days_to_expiration, asOfDate: req.as_of_date, now })
          .then((result) => ({ ok: true, result }))
          .catch((err) => ({ ok: false, structure, error: plainError(err), code: err.code || 'BACKTEST_FAILED' }))
      )
    );
    const results = settled.filter((s) => s.ok).map((s) => s.result);
    const errors = settled.filter((s) => !s.ok).map(({ structure, error, code }) => ({ structure, error, code }));
    if (!results.length) throw new BacktestRunError(`${errors[0]?.error || 'no structure could be evaluated.'}`, errors[0]?.code);

    const ranked = rankResults(results, req.rank_by);
    const caveats = backtestCaveats(ranked, job, now);
    const signalHistory = job.signal_reference ? await loadSignalHistory(job.ticker, job.signal_reference).catch(() => null) : null;
    const link = await createShortLink({ targetPath: `/kimi/backtests/${jobId}`, kind: 'backtest', userId: job.user_id, backtestId: jobId, alertId: job.alert_id || null });
    const summaryText = formatComparisonText({ ticker: job.ticker, ranked, rankBy: req.rank_by, caveat: caveats[0] });
    const top = ranked[0];
    const runtimeMs = clockNow().getTime() - started;

    await updateBacktest(jobId, {
      status: 'completed',
      results: ranked,
      errors,
      ranking: ranked.map((r) => r.structure),
      winner: top.structure,
      summary_metrics: {
        structure: top.structure,
        label: top.label,
        trades: top.trades,
        win_rate: top.win_rate,
        avg_return: top.avg_return,
        max_drawdown: top.max_drawdown,
        sharpe: top.sharpe
      },
      caveat: caveats[0],
      caveats,
      signal_history: signalHistory,
      short_code: link.code,
      results_url: link.url,
      summary_text: summaryText,
      runtime_ms: runtimeMs,
      completed_at: clockNow().toISOString()
    });
    await emitEvent('backtest_completed', {
      userId: job.user_id,
      ticker: job.ticker,
      channel: job.notify?.channel || null,
      properties: {
        job_id: jobId,
        source: job.source,
        winner: top.structure,
        runtime_ms: runtimeMs,
        rank_by: req.rank_by,
        results: ranked.map((r) => ({ structure: r.structure, trades: r.trades, win_rate: r.win_rate, avg_return: r.avg_return, max_drawdown: r.max_drawdown, sharpe: r.sharpe }))
      }
    });
    await notifyUser(job, summaryText, { linkUrl: link.url });
  } catch (err) {
    const reason = plainError(err);
    await updateBacktest(jobId, {
      status: 'failed',
      error: reason,
      error_code: err.code || 'BACKTEST_FAILED',
      runtime_ms: clockNow().getTime() - started,
      completed_at: clockNow().toISOString()
    });
    await emitEvent('backtest_failed', {
      userId: job.user_id,
      ticker: job.ticker,
      channel: job.notify?.channel || null,
      properties: { job_id: jobId, source: job.source, error: reason, code: err.code || 'BACKTEST_FAILED' }
    });
    await notifyUser(job, KIMI_CONFIG.templates.backtestFailed({ ticker: job.ticker, reason: reason.charAt(0).toUpperCase() + reason.slice(1) }));
  }
  return getBacktest(jobId);
}

/** Run queued jobs that never started and fail jobs stuck running. */
export async function sweepBacktests({ now = clockNow(), runQueued = true } = {}) {
  const staleMs = CFG.staleJobMinutes * 60000;
  const out = { started: 0, timedOut: 0 };
  for (const job of await queryBacktests({ status: 'running' })) {
    if (now - new Date(job.started_at || job.created_at) < staleMs) continue;
    const res = await updateBacktestIf(job.id, (j) => j?.status === 'running', {
      status: 'failed',
      error: 'The backtest timed out.',
      error_code: 'TIMEOUT',
      completed_at: now.toISOString()
    });
    if (!res.updated) continue;
    out.timedOut += 1;
    await emitEvent('backtest_failed', { userId: job.user_id, ticker: job.ticker, channel: job.notify?.channel || null, properties: { job_id: job.id, source: job.source, error: 'timed out', code: 'TIMEOUT' } });
    await notifyUser(job, KIMI_CONFIG.templates.backtestFailed({ ticker: job.ticker, reason: 'It timed out.' }));
  }
  if (runQueued) {
    for (const job of await queryBacktests({ status: 'queued' })) {
      if (now - new Date(job.created_at) < 60000) continue;
      await runBacktestJob(job.id, { now });
      out.started += 1;
    }
  }
  return out;
}

export async function getOwnedBacktest(userId, jobId) {
  const job = await getBacktest(jobId);
  if (!job) throw Object.assign(new Error('Backtest not found'), { code: 'NOT_FOUND' });
  if (job.user_id !== userId) throw Object.assign(new Error('Forbidden: this backtest belongs to another user'), { code: 'FORBIDDEN' });
  return job;
}

export async function compareBacktests({ userId, jobIds, rankBy = CFG.defaultRankBy }) {
  if (!Array.isArray(jobIds) || jobIds.length === 0) throw new BacktestRequestError('job_ids is required.');
  const jobs = await Promise.all(jobIds.slice(0, 10).map((id) => getOwnedBacktest(userId, String(id))));
  const rows = [];
  for (const job of jobs) {
    for (const r of job.results || []) rows.push({ ...r, job_id: job.id, ticker: job.ticker, results_url: job.results_url || null });
  }
  if (!rows.length) return { rank_by: rankBy, top_3: [], note: 'None of these backtests have results yet.' };
  const ranked = rankResults(rows, rankBy);
  return {
    rank_by: rankBy,
    compared: ranked.length,
    top_3: ranked.slice(0, 3).map((r) => ({
      job_id: r.job_id,
      ticker: r.ticker,
      structure: r.structure,
      label: r.label,
      trades: r.trades,
      win_rate: r.win_rate,
      avg_return: r.avg_return,
      max_drawdown: r.max_drawdown,
      sharpe: r.sharpe,
      results_url: r.results_url
    })),
    disclaimer: KIMI_CONFIG.disclaimers.backtestSummary
  };
}
