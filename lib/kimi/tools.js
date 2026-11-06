// Kimi's tools, mapped onto the existing internal APIs (see docs/kimi/PLAN.md).
//
// Authorization is server-side: the authenticated user id comes from the
// execution context, never from the model. No tool schema exposes a user id,
// any model-supplied ownership field is discarded, and every tool only reads
// the caller's own alerts, backtests and preferences. Every call is logged
// (name, args, latency, success or error) to kimi_tool_calls + kimi_events.

import { KIMI_CONFIG } from './kimi.config.js';
import { backend, SECTORS } from './backend.js';
import { formatInTimeZone, isValidTimeZone, clockNow } from './runtime.js';
import { markRecentAlerts } from './keywords.js';
import {
  emitEvent,
  getAlert,
  getDelivery,
  getProfile,
  queryDeliveries,
  recordToolCall,
  updateProfile,
  withDefaultPreferences
} from './store.js';
import {
  BACKTEST_REQUEST_SCHEMA,
  BacktestRequestError,
  compareBacktests,
  getOwnedBacktest,
  listStructures,
  submitBacktest
} from './backtests.js';

export class ToolError extends Error {
  constructor(message, code = 'TOOL_ERROR') {
    super(message);
    this.code = code;
  }
}

const RANK_ENUM = KIMI_CONFIG.backtests.rankMetrics;

export const TOOL_DEFINITIONS = [
  {
    name: 'get_recent_dark_pool_prints',
    description:
      'Session-level dark pool print aggregates from KAHF\'s tape (shares, notional USD, average price, trade count, volume ratio vs the 7-day average). Use for "MORE" details and ad-hoc dark pool questions. Omit ticker for the latest session\'s most unusual names.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ticker: { type: 'string', description: 'Symbol such as "NVDA".' },
        since: { type: 'string', description: 'YYYY-MM-DD; only sessions on or after this date.' },
        min_notional: { type: 'number', description: 'Minimum session notional in USD.' }
      }
    }
  },
  {
    name: 'get_alert',
    description: 'A past alert Kimi sent this user, with the unmodified backend signal payload and its live mark.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['alert_id'],
      properties: { alert_id: { type: 'string', description: 'Alert id, e.g. "CSX__2026-10-22".' } }
    }
  },
  {
    name: 'list_backtest_structures',
    description: 'Structures supported by KAHF\'s backtest API and the exact request fields run_backtest accepts.',
    input_schema: { type: 'object', additionalProperties: false, properties: {} }
  },
  {
    name: 'run_backtest',
    description:
      'Start a backtest on KAHF\'s backtest infrastructure. Runs asynchronously: returns a job id and time estimate immediately, and Kimi texts the ranked results when done. Use only the fields in the schema.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['config'],
      properties: { config: BACKTEST_REQUEST_SCHEMA }
    }
  },
  {
    name: 'get_backtest_result',
    description: 'Status and results of one of this user\'s backtest jobs.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['job_id'],
      properties: { job_id: { type: 'string' } }
    }
  },
  {
    name: 'compare_backtests',
    description: 'Rank structures across several of this user\'s completed backtests.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['job_ids'],
      properties: {
        job_ids: { type: 'array', items: { type: 'string' } },
        rank_by: { type: 'string', enum: RANK_ENUM, description: 'Default sharpe.' }
      }
    }
  },
  {
    name: 'get_preferences',
    description: 'This user\'s alert delivery preferences.',
    input_schema: { type: 'object', additionalProperties: false, properties: {} }
  },
  {
    name: 'update_preferences',
    description:
      'Change this user\'s alert delivery preferences. Only include fields that change. These are personal delivery filters, not signal parameters.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        watchlist_mode: { type: 'string', enum: ['all', 'custom'], description: '"all" = every signal; "custom" = only listed tickers/sectors.' },
        add_tickers: { type: 'array', items: { type: 'string' } },
        remove_tickers: { type: 'array', items: { type: 'string' } },
        set_sectors: { type: 'array', items: { type: 'string', enum: SECTORS } },
        mute_tickers: { type: 'array', items: { type: 'string' }, description: 'Never alert on these tickers.' },
        unmute_tickers: { type: 'array', items: { type: 'string' } },
        min_notional: { type: 'number', description: 'Minimum signal notional in USD; 0 for no filter.' },
        timezone: { type: 'string', description: 'IANA timezone, e.g. America/Chicago.' },
        quiet_hours: {
          type: 'object',
          additionalProperties: false,
          properties: { enabled: { type: 'boolean' }, start: { type: 'string', description: 'HH:MM' }, end: { type: 'string', description: 'HH:MM' } }
        },
        market_hours_only: { type: 'boolean' },
        max_alerts_per_day: { type: 'integer', minimum: 1, maximum: 25 },
        digest: {
          type: 'object',
          additionalProperties: false,
          properties: { enabled: { type: 'boolean' }, interval_minutes: { type: 'integer', minimum: 10, maximum: 240 } }
        },
        paused_until: { type: ['string', 'null'], description: 'ISO date-time to pause alerts until, or null to resume.' }
      }
    }
  },
  {
    name: 'get_stock_quote',
    description: 'Previous session close for a ticker from KAHF\'s price feed (Polygon). Not a real-time quote.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ticker'],
      properties: { ticker: { type: 'string' } }
    }
  }
];

function cleanTicker(value) {
  const t = String(value || '').replace(/^\$/, '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(t)) throw new ToolError(`"${value}" isn't a valid ticker.`, 'INVALID_TICKER');
  return t;
}

function cleanTickers(list) {
  return Array.isArray(list) ? [...new Set(list.map(cleanTicker))] : [];
}

function validHhMm(v) {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
}

export function prefsView(profile) {
  const prefs = withDefaultPreferences(profile?.preferences);
      return {
    timezone: profile?.timezone || KIMI_CONFIG.delivery.defaultTimezone,
    paused_until: profile?.paused_until || null,
    opted_out: Boolean(profile?.opted_out_at),
    watchlist: prefs.watchlist,
    min_notional: prefs.min_notional,
    quiet_hours: prefs.quiet_hours,
    market_hours_only: prefs.market_hours_only,
    max_alerts_per_day: prefs.max_alerts_per_day,
    max_alerts_per_hour: prefs.max_alerts_per_hour,
    digest: prefs.digest
  };
}

/** Apply a validated preference patch. Shared by the tool and the website. */
export async function applyPreferenceChanges(userId, args = {}, { source = 'agent', now = clockNow() } = {}) {
  const profile = await getProfile(userId);
  if (!profile) throw new ToolError('Profile not found', 'NOT_FOUND');
  const prefs = withDefaultPreferences(profile.preferences);
  const watchlist = { ...prefs.watchlist };
  const changed = [];
  const patch = {};

  if (args.watchlist_mode !== undefined) {
    if (!['all', 'custom'].includes(args.watchlist_mode)) throw new ToolError('watchlist_mode must be "all" or "custom".');
    watchlist.mode = args.watchlist_mode;
    changed.push('watchlist_mode');
  }
  if (args.set_tickers !== undefined) {
    watchlist.tickers = cleanTickers(args.set_tickers);
    changed.push('watchlist_tickers');
  }
  if (args.add_tickers?.length) {
    watchlist.tickers = [...new Set([...watchlist.tickers, ...cleanTickers(args.add_tickers)])];
    if (args.watchlist_mode === undefined) watchlist.mode = 'custom';
    changed.push('watchlist_tickers');
  }
  if (args.remove_tickers?.length) {
    const drop = new Set(cleanTickers(args.remove_tickers));
    watchlist.tickers = watchlist.tickers.filter((t) => !drop.has(t));
    changed.push('watchlist_tickers');
  }
  if (args.set_sectors !== undefined) {
    const sectors = (Array.isArray(args.set_sectors) ? args.set_sectors : []).filter((s) => SECTORS.includes(s));
    watchlist.sectors = [...new Set(sectors)];
    changed.push('watchlist_sectors');
  }
  const muted = new Set(watchlist.muted || []);
  if (args.mute_tickers?.length) {
    cleanTickers(args.mute_tickers).forEach((t) => muted.add(t));
    changed.push('muted_tickers');
  }
  if (args.unmute_tickers?.length) {
    cleanTickers(args.unmute_tickers).forEach((t) => muted.delete(t));
    changed.push('muted_tickers');
  }
  watchlist.muted = [...muted];

  const next = { ...prefs, watchlist };
  if (args.min_notional !== undefined) {
    const v = Number(args.min_notional);
    if (!Number.isFinite(v) || v < 0) throw new ToolError('min_notional must be a non-negative number of dollars.');
    next.min_notional = Math.round(v);
    changed.push('min_notional');
  }
  if (args.quiet_hours !== undefined) {
    const q = { ...prefs.quiet_hours, ...args.quiet_hours };
    if (q.enabled && (!validHhMm(q.start) || !validHhMm(q.end))) throw new ToolError('Quiet hours need start and end as HH:MM.');
    next.quiet_hours = { enabled: Boolean(q.enabled), start: q.start, end: q.end };
    changed.push('quiet_hours');
  }
  if (args.market_hours_only !== undefined) {
    next.market_hours_only = Boolean(args.market_hours_only);
    changed.push('market_hours_only');
  }
  if (args.max_alerts_per_day !== undefined) {
    const { min, max } = KIMI_CONFIG.delivery.maxAlertsPerDayBounds;
    const v = parseInt(args.max_alerts_per_day, 10);
    if (!Number.isFinite(v) || v < min || v > max) throw new ToolError(`max_alerts_per_day must be ${min}-${max}.`);
    next.max_alerts_per_day = v;
    changed.push('max_alerts_per_day');
  }
  if (args.digest !== undefined) {
    const { min, max } = KIMI_CONFIG.delivery.digestIntervalBounds;
    const d = { ...prefs.digest, ...args.digest };
    const interval = parseInt(d.interval_minutes, 10);
    if (!Number.isFinite(interval) || interval < min || interval > max) throw new ToolError(`Digest interval must be ${min}-${max} minutes.`);
    next.digest = { enabled: Boolean(d.enabled), interval_minutes: interval };
    changed.push('digest');
  }
  if (changed.length) patch.preferences = next;
  if (args.timezone !== undefined) {
    if (!isValidTimeZone(args.timezone)) throw new ToolError(`"${args.timezone}" isn't a valid IANA timezone.`);
    patch.timezone = args.timezone;
    changed.push('timezone');
  }
  if (args.paused_until !== undefined) {
    if (args.paused_until === null || args.paused_until === '') patch.paused_until = null;
    else {
      const t = Date.parse(args.paused_until);
      if (!Number.isFinite(t)) throw new ToolError('paused_until must be an ISO date-time.');
      patch.paused_until = new Date(t).toISOString();
    }
    changed.push('paused_until');
  }
  if (!changed.length) return { changed: [], preferences: prefsView(profile) };

  const updated = await updateProfile(userId, patch);
  await emitEvent('prefs_updated', { userId, properties: { source, fields: [...new Set(changed)] } });
  if (args.mute_tickers?.length) {
    for (const t of cleanTickers(args.mute_tickers)) await markRecentAlerts(userId, 'muted_after_at', now, { ticker: t });
  }
  if (patch.paused_until) await markRecentAlerts(userId, 'muted_after_at', now);
  return { changed: [...new Set(changed)], preferences: prefsView(updated) };
}

function compactSignal(payload = {}) {
  const keep = ['date', 'ticker', 'volume_ratio', 'dark_pool_value', 'dark_pool_avg_price', 'structure', 'direction', 'strike', 'expiration', 'dte', 'entry_premium', 'asof_hit_rate', 'asof_samples', 'found_at'];
  return Object.fromEntries(keep.filter((k) => payload[k] !== undefined).map((k) => [k, payload[k]]));
}

const HANDLERS = {
  async get_recent_dark_pool_prints(args) {
    const ticker = args.ticker ? cleanTicker(args.ticker) : null;
    const since = /^\d{4}-\d{2}-\d{2}$/.test(args.since || '') ? args.since : null;
    const minNotional = Number(args.min_notional) > 0 ? Number(args.min_notional) : 0;
    return backend().getRecentPrints({ ticker, since, minNotional, limit: ticker ? 10 : 8 });
  },

  async get_alert(args, ctx) {
    const alertId = String(args.alert_id || '').trim();
    if (!alertId) throw new ToolError('alert_id is required.');
    const delivery = await getDelivery(alertId, ctx.userId);
    if (!delivery || !['sent', 'delivered'].includes(delivery.status)) {
      throw new ToolError('Forbidden: that alert was not sent to this user.', 'FORBIDDEN');
    }
    const alert = await getAlert(alertId);
    if (!alert) throw new ToolError('Alert not found.', 'NOT_FOUND');
    const liveMark = alert.signal_payload?.contracts ? await backend().markSignal(alert.signal_payload).catch(() => null) : null;
    return {
      alert_id: alert.id,
      ticker: alert.ticker,
      status: alert.status,
      backend_param_version: alert.backend_param_version || null,
      sent_at_local: delivery.sent_at ? formatInTimeZone(new Date(delivery.sent_at), ctx.timezone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : null,
      signal_payload: compactSignal(alert.signal_payload),
      live_mark: liveMark
        ? { status: liveMark.status, current_premium: liveMark.currentPremium ?? null, return_pct: liveMark.returnPct ?? null, exit_reason: liveMark.exitReason || null }
        : null,
      forward_returns: alert.forward_returns || null
    };
  },

  async list_backtest_structures() {
    return listStructures();
  },

  async run_backtest(args, ctx) {
    const { job, ack, estimateSeconds } = await submitBacktest({
      userId: ctx.userId,
      request: args.config || {},
      source: ctx.channel === 'web' ? 'web' : 'free_form',
      channel: ctx.channel,
      provider: ctx.providerName
    });
    ctx.pendingJobs?.push(job.id);
    return {
      job_id: job.id,
      status: 'queued',
      ticker: job.ticker,
      structures: job.structures,
      days_to_expiration: job.request.days_to_expiration,
      as_of_date: job.request.as_of_date,
      rank_by: job.rank_by,
      estimated_seconds: estimateSeconds,
      acknowledgement: ack,
      note: 'Results are texted automatically when the job finishes. Acknowledge now; do not wait or poll.'
    };
  },

  async get_backtest_result(args, ctx) {
    const job = await getOwnedBacktest(ctx.userId, String(args.job_id || '')).catch((err) => {
      throw new ToolError(err.message, err.code);
    });
    return {
      job_id: job.id,
      ticker: job.ticker,
      status: job.status,
      request: job.request,
      error: job.error || null,
      results: (job.results || []).map((r) => ({
        rank: r.rank,
        structure: r.structure,
        label: r.label,
        trades: r.trades,
        win_rate: r.win_rate,
        avg_return: r.avg_return,
        max_drawdown: r.max_drawdown,
        sharpe: r.sharpe,
        strike: r.quote?.strike,
        premium: r.quote?.premium,
        expiration: r.quote?.expiration
      })),
      caveat: job.caveat || null,
      results_url: job.results_url || null
    };
  },

  async compare_backtests(args, ctx) {
    return compareBacktests({ userId: ctx.userId, jobIds: args.job_ids, rankBy: args.rank_by || KIMI_CONFIG.backtests.defaultRankBy });
  },

  async get_preferences(_args, ctx) {
    const profile = await getProfile(ctx.userId);
    const sent = (await queryDeliveries({ userId: ctx.userId })).filter((d) => d.status === 'sent' || d.status === 'delivered');
    return { ...prefsView(profile), alerts_received_total: sent.length, settings_url: `${KIMI_CONFIG.publicBaseUrl}/kimi?tab=preferences` };
  },

  async update_preferences(args, ctx) {
    return applyPreferenceChanges(ctx.userId, args, { source: ctx.channel === 'web' ? 'web_chat' : 'text' });
  },

  async get_stock_quote(args) {
    const ticker = cleanTicker(args.ticker);
    if (!process.env.POLYGON_API_KEY) throw new ToolError('Price feed unavailable right now.', 'UNAVAILABLE');
    return backend().getPreviousClose(ticker);
  }
};

const MAX_RESULT_CHARS = 6000;

export function serializeToolResult(result) {
  const json = JSON.stringify(result ?? null);
  return json.length > MAX_RESULT_CHARS ? `${json.slice(0, MAX_RESULT_CHARS)}…(truncated)` : json;
}

/**
 * Execute a tool for the authenticated user in `ctx.userId`.
 * ctx: { userId, timezone, channel, providerName, messageId, pendingJobs[] }
 */
export async function executeTool(name, rawArgs = {}, ctx = {}) {
  if (!ctx.userId || typeof ctx.userId !== 'string') throw new ToolError('Unauthorized: no authenticated user.', 'UNAUTHORIZED');
  const args = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? { ...rawArgs } : {};
  for (const key of ['user_id', 'userId', 'uid', 'owner_id']) delete args[key];
  if (args.config && typeof args.config === 'object') {
    args.config = { ...args.config };
    for (const key of ['user_id', 'userId', 'uid', 'owner_id']) delete args.config[key];
  }

  const handler = HANDLERS[name];
  const started = clockNow().getTime();
  const log = { userId: ctx.userId, channel: ctx.channel || null, messageId: ctx.messageId || null, tool: name, args };
  if (!handler) {
    await recordToolCall({ ...log, latencyMs: 0, success: false, error: 'unknown tool' });
    throw new ToolError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
  }
  try {
    const result = await handler(args, ctx);
    await recordToolCall({ ...log, latencyMs: clockNow().getTime() - started, success: true });
    return result;
  } catch (err) {
    const message = err instanceof BacktestRequestError || err instanceof ToolError ? err.message : `Tool failed: ${err.message}`;
    await recordToolCall({ ...log, latencyMs: clockNow().getTime() - started, success: false, error: message.slice(0, 300) });
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { toolMessage: message });
  }
}
