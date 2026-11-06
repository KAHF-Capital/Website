// Analytics for /admin/kimi.
//
// Charts read kimi_daily_rollups, rebuilt from kimi_events by the scheduled
// rollup job (and refreshed for today on demand). Each rollup stores counts
// and sums under every channel x plan x ticker key ("sms|pro|*"), so any
// filter combination is read exactly. KPI cards, deltas and drill-down tables
// use raw records for the selected period and the one before it.

import { KIMI_CONFIG } from './kimi.config.js';
import { addDays, startOfLocalDay, usageDay, clockNow } from './runtime.js';
import { describeDb } from './db.js';
import { queueStats } from './queue.js';
import { INTENTS } from './llm.js';
import {
  getSystemState,
  listProfiles,
  queryAlerts,
  queryAudit,
  queryBacktests,
  queryDeliveries,
  queryEvents,
  queryFlaggedConversations,
  queryMessages,
  queryRollups,
  queryToolCalls,
  saveRollup,
  updateSystemMeta
} from './store.js';

const TZ = 'America/New_York';
export const CHANNELS = ['imessage', 'sms', 'web'];
export const PLANS = ['pro', 'free'];
export const SUPPRESSION_REASONS = ['watchlist_miss', 'min_notional', 'paused', 'opted_out', 'quiet_hours', 'market_hours', 'cap', 'dedupe', 'stale', 'retracted', 'kill_switch'];

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------

const round = (n, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

export function percentile(values, p) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))];
}

export function deltaPct(current, previous) {
  if (current === null || previous === null || current === undefined || previous === undefined) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return round(((current - previous) / Math.abs(previous)) * 100, 1);
}

const pct = (n, d) => (d ? round((n / d) * 100, 1) : null);
const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);

function histogram(values, edges) {
  const bins = edges.slice(0, -1).map((lo, i) => ({ label: `${lo} to ${edges[i + 1]}`, lo, hi: edges[i + 1], count: 0 }));
  for (const v of values) {
    if (typeof v !== 'number') continue;
    const bin = bins.find((b, i) => (v >= b.lo && v < b.hi) || (i === bins.length - 1 && v >= b.lo)) || (v < bins[0].lo ? bins[0] : null);
    if (bin) bin.count += 1;
  }
  return bins;
}

function dayList(fromDay, toDay) {
  const out = [];
  for (let d = fromDay; d <= toDay && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

const validDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export function resolveRange({ from = null, to = null, now = clockNow() } = {}) {
  const today = usageDay(now);
  const toDay = validDay(to) && to <= today ? to : today;
  let fromDay = validDay(from) && from <= toDay ? from : addDays(toDay, -29);
  if (dayList(fromDay, toDay).length > 366) fromDay = addDays(toDay, -365);
  const days = dayList(fromDay, toDay).length;
  const prevToDay = addDays(fromDay, -1);
  const prevFromDay = addDays(prevToDay, -(days - 1));
  return {
    fromDay,
    toDay,
    days,
    start: startOfLocalDay(fromDay, TZ).toISOString(),
    end: startOfLocalDay(addDays(toDay, 1), TZ).toISOString(),
    prevFromDay,
    prevToDay,
    prevStart: startOfLocalDay(prevFromDay, TZ).toISOString(),
    prevEnd: startOfLocalDay(fromDay, TZ).toISOString()
  };
}

export function normalizeFilters({ channel = 'all', plan = 'all', ticker = '' } = {}) {
  return {
    channel: CHANNELS.includes(channel) ? channel : 'all',
    plan: PLANS.includes(plan) ? plan : 'all',
    ticker: /^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(String(ticker || '').replace(/^\$/, '')) ? String(ticker).replace(/^\$/, '').toUpperCase() : ''
  };
}

// ---------------------------------------------------------------------------
// Daily rollups
// ---------------------------------------------------------------------------

const COUNT_METRICS = {
  inbound: (e) => e.type === 'message_inbound',
  outbound: (e) => e.type === 'message_outbound' && e.properties?.status !== 'failed',
  replies: (e) => e.type === 'message_outbound' && e.properties?.kind === 'reply',
  signals_received: (e) => e.type === 'signal_received',
  alerts_sent: (e) => e.type === 'alert_sent',
  alerts_suppressed: (e) => e.type === 'alert_suppressed',
  backtests_requested: (e) => e.type === 'backtest_requested',
  backtests_completed: (e) => e.type === 'backtest_completed',
  backtests_failed: (e) => e.type === 'backtest_failed',
  signups: (e) => e.type === 'signup_started',
  verified: (e) => e.type === 'phone_verified',
  opt_outs: (e) => e.type === 'opted_out',
  llm_calls: (e) => e.type === 'llm_call',
  llm_errors: (e) => e.type === 'llm_error' || e.type === 'llm_timeout',
  tool_calls: (e) => e.type === 'tool_called' || e.type === 'tool_failed',
  tool_failures: (e) => e.type === 'tool_failed',
  send_failures: (e) => e.type === 'send_failed',
  webhook_rejected: (e) => e.type === 'webhook_rejected',
  fallbacks: (e) => e.type === 'agent_fallback'
};

const SUM_METRICS = {
  llm_cost_usd: (e) => (e.type === 'llm_call' ? e.properties?.cost_usd : 0),
  tokens: (e) => (e.type === 'llm_call' ? (e.properties?.tokens_in || 0) + (e.properties?.tokens_out || 0) : 0),
  messaging_cost_usd: (e) => (e.type === 'message_outbound' ? e.properties?.messaging_cost_usd : 0)
};

// Signal-level events have no user or channel; they count under every key.
const GLOBAL_EVENT_TYPES = new Set(['signal_received']);

function eventKeys(e, planOf, tickersOfDay) {
  const global = GLOBAL_EVENT_TYPES.has(e.type);
  const channels = global ? ['*', ...CHANNELS] : e.channel ? ['*', e.channel] : ['*'];
  const plan = e.user_id ? planOf(e.user_id) : null;
  const plans = global || !e.user_id ? ['*', ...PLANS] : plan ? ['*', plan] : ['*'];
  const tickers = e.ticker ? ['*', e.ticker] : global ? ['*', ...tickersOfDay] : ['*'];
  const keys = [];
  for (const c of channels) for (const p of plans) for (const t of tickers) keys.push(`${c}|${p}|${t}`);
  return keys;
}

export async function buildRollupForDay(day, { profiles = null } = {}) {
  const start = startOfLocalDay(day, TZ).toISOString();
  const end = startOfLocalDay(addDays(day, 1), TZ).toISOString();
  const [events, allProfiles] = await Promise.all([queryEvents({ from: start, to: end }), profiles ? Promise.resolve(profiles) : listProfiles()]);
  const planById = new Map(allProfiles.map((p) => [p.user_id, p.plan || 'free']));
  const planOf = (uid) => planById.get(uid) || 'free';
  const tickers = [...new Set(events.map((e) => e.ticker).filter(Boolean))];
  const keys = {};
  for (const e of events) {
    const counts = Object.entries(COUNT_METRICS).filter(([, f]) => f(e)).map(([m]) => m);
    const sums = Object.entries(SUM_METRICS).map(([m, f]) => [m, Number(f(e)) || 0]).filter(([, v]) => v);
    if (!counts.length && !sums.length) continue;
    for (const key of eventKeys(e, planOf, tickers)) {
      const bucket = keys[key] || (keys[key] = {});
      for (const m of counts) bucket[m] = (bucket[m] || 0) + 1;
      for (const [m, v] of sums) bucket[m] = round((bucket[m] || 0) + v, 6);
    }
  }
  const doc = { day, events: events.length, keys, built_at: clockNow().toISOString() };
  await saveRollup(day, doc);
  return doc;
}

export async function buildRollups({ fromDay, toDay }) {
  const profiles = await listProfiles();
  const days = dayList(fromDay, toDay);
  for (const day of days) await buildRollupForDay(day, { profiles });
  await updateSystemMeta({ last_rollup_at: clockNow().toISOString() });
  return { days: days.length, fromDay, toDay };
}

/**
 * Build any missing rollup days in [fromDay, toDay], and rebuild today's and
 * yesterday's when older than `maxAgeMs`, so charts never depend on the cron.
 */
export async function ensureFreshRollups({ now = clockNow(), fromDay = null, maxAgeMs = 10 * 60 * 1000 } = {}) {
  const today = usageDay(now);
  const yesterday = addDays(today, -1);
  const start = fromDay && fromDay < yesterday ? fromDay : yesterday;
  const existing = await queryRollups({ from: start, to: today });
  const byDay = new Map(existing.map((r) => [r.day, r]));
  let profiles = null;
  for (const day of dayList(start, today)) {
    const r = byDay.get(day);
    const recent = day === today || day === yesterday;
    if (r && !(recent && now - new Date(r.built_at) > maxAgeMs)) continue;
    if (!profiles) profiles = await listProfiles();
    await buildRollupForDay(day, { profiles });
  }
}

function rollupKey(filters) {
  return `${filters.channel === 'all' ? '*' : filters.channel}|${filters.plan === 'all' ? '*' : filters.plan}|${filters.ticker || '*'}`;
}

function rollupSeries(rollups, range, filters, metrics) {
  const key = rollupKey(filters);
  const byDay = new Map(rollups.map((r) => [r.day, r.keys?.[key] || {}]));
  return dayList(range.fromDay, range.toDay).map((day) => {
    const bucket = byDay.get(day) || {};
    const row = { day };
    for (const m of metrics) row[m] = bucket[m] || 0;
    return row;
  });
}

function rollupTotals(rollups, fromDay, toDay, filters) {
  const key = rollupKey(filters);
  const totals = {};
  for (const r of rollups) {
    if (r.day < fromDay || r.day > toDay) continue;
    for (const [m, v] of Object.entries(r.keys?.[key] || {})) totals[m] = round((totals[m] || 0) + v, 6);
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Shared loading and filtering
// ---------------------------------------------------------------------------

function makeFilter(filters, profilesById) {
  return (record, { tickerField = 'ticker', textField = null, channelField = 'channel', userField = 'user_id' } = {}) => {
    if (filters.channel !== 'all' && channelField && record[channelField] !== filters.channel) return false;
    if (filters.plan !== 'all') {
      const uid = record[userField];
      if (!uid || (profilesById.get(uid)?.plan || 'free') !== filters.plan) return false;
    }
    if (filters.ticker) {
      if (tickerField && record[tickerField]) return String(record[tickerField]).toUpperCase() === filters.ticker;
      if (textField) return new RegExp(`\\$${filters.ticker}\\b`).test(String(record[textField] || '').toUpperCase());
      return false;
    }
    return true;
  };
}

async function loadContext({ from, to, channel, plan, ticker, now = clockNow() }) {
  const range = resolveRange({ from, to, now });
  const filters = normalizeFilters({ channel, plan, ticker });
  const profiles = await listProfiles();
  const profilesById = new Map(profiles.map((p) => [p.user_id, p]));
  return { range, filters, profiles, profilesById, match: makeFilter(filters, profilesById), now };
}

function inPeriod(iso, start, end) {
  return Boolean(iso) && iso >= start && iso < end;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

async function overview(ctx) {
  const { range, filters, profiles, match } = ctx;
  await ensureFreshRollups({ now: ctx.now, fromDay: ctx.range.prevFromDay });
  const rollups = await queryRollups({ from: range.prevFromDay, to: range.toDay });
  const cur = rollupTotals(rollups, range.fromDay, range.toDay, filters);
  const prev = rollupTotals(rollups, range.prevFromDay, range.prevToDay, filters);

  const planOk = (p) => filters.plan === 'all' || (p.plan || 'free') === filters.plan;
  const usersAt = (iso) => profiles.filter((p) => planOk(p) && p.created_at && p.created_at < iso).length;
  const verifiedAt = (iso) => profiles.filter((p) => planOk(p) && p.phone_verified_at && p.phone_verified_at < iso && p.consent_at).length;

  const activeFrom = new Date(new Date(range.prevEnd).getTime() - 30 * 86400000).toISOString();
  const msgs = (await queryMessages({ from: activeFrom < range.prevStart ? activeFrom : range.prevStart, to: range.end })).filter((m) =>
    match(m, { tickerField: null, textField: 'body' })
  );
  const activeUsers = (endIso, days) => {
    const startIso = new Date(new Date(endIso).getTime() - days * 86400000).toISOString();
    return new Set(msgs.filter((m) => m.direction === 'inbound' && m.user_id && inPeriod(m.created_at, startIso, endIso)).map((m) => m.user_id)).size;
  };
  const replyLatency = (start, end) => msgs.filter((m) => m.direction === 'outbound' && m.kind === 'reply' && m.latency_ms > 0 && inPeriod(m.created_at, start, end)).map((m) => m.latency_ms);
  const latCur = replyLatency(range.start, range.end);
  const latPrev = replyLatency(range.prevStart, range.prevEnd);

  const kpi = (key, label, value, previous, extra = {}) => ({ key, label, value, previous, delta: deltaPct(value, previous), ...extra });
  const verifiedNow = verifiedAt(range.end);
  const verifiedPrev = verifiedAt(range.prevEnd);
  const dau = [activeUsers(range.end, 1), activeUsers(range.prevEnd, 1)];
  const wau = [activeUsers(range.end, 7), activeUsers(range.prevEnd, 7)];
  const mau = [activeUsers(range.end, 30), activeUsers(range.prevEnd, 30)];

  return {
    kpis: [
      kpi('total_users', 'Total users', usersAt(range.end), usersAt(range.prevEnd)),
      kpi('verified_users', 'Verified users', verifiedNow, verifiedPrev),
      kpi('dau', 'DAU', dau[0], dau[1], { group: 'active' }),
      kpi('wau', 'WAU', wau[0], wau[1], { group: 'active' }),
      kpi('mau', 'MAU', mau[0], mau[1], { group: 'active' }),
      kpi('inbound', 'Inbound messages', cur.inbound || 0, prev.inbound || 0),
      kpi('outbound', 'Outbound messages', cur.outbound || 0, prev.outbound || 0),
      kpi('alerts_sent', 'Alerts sent', cur.alerts_sent || 0, prev.alerts_sent || 0),
      kpi('backtests', 'Backtests run', cur.backtests_requested || 0, prev.backtests_requested || 0),
      kpi('reply_p50', 'Median reply latency', percentile(latCur, 50), percentile(latPrev, 50), { unit: 'ms', lowerIsBetter: true }),
      kpi('reply_p95', 'p95 reply latency', percentile(latCur, 95), percentile(latPrev, 95), { unit: 'ms', lowerIsBetter: true }),
      kpi('llm_cost', 'LLM cost', round(cur.llm_cost_usd || 0, 2), round(prev.llm_cost_usd || 0, 2), { unit: 'usd', lowerIsBetter: true }),
      kpi('messaging_cost', 'Messaging cost', round(cur.messaging_cost_usd || 0, 2), round(prev.messaging_cost_usd || 0, 2), { unit: 'usd', lowerIsBetter: true }),
      kpi('opt_out_rate', 'Opt-out rate', pct(cur.opt_outs || 0, verifiedNow) ?? 0, pct(prev.opt_outs || 0, verifiedPrev) ?? 0, { unit: 'pct', lowerIsBetter: true })
    ],
    series: rollupSeries(rollups, range, filters, ['inbound', 'outbound', 'alerts_sent', 'backtests_requested'])
  };
}

async function funnel(ctx) {
  const { range, filters, profiles, now } = ctx;
  const cohort = profiles.filter(
    (p) => p.created_at && inPeriod(p.created_at, range.start, range.end) && (filters.plan === 'all' || (p.plan || 'free') === filters.plan)
  );
  const activeIn = (p, fromOffset, toOffset) => {
    const signup = usageDay(new Date(p.created_at));
    return Object.keys(p.active_days || {}).some((d) => d >= addDays(signup, fromOffset) && d <= addDays(signup, toOffset));
  };
  const steps = [
    ['signup', 'Signed up', () => true],
    ['verified', 'Phone verified', (p) => Boolean(p.phone_verified_at)],
    ['consented', 'Consented to texts', (p) => Boolean(p.consent_at)],
    ['first_text', 'First inbound text', (p) => Boolean(p.first_inbound_text_at)],
    ['first_backtest', 'First backtest', (p) => Boolean(p.first_backtest_at)],
    ['week2', 'Active in week 2', (p) => activeIn(p, 7, 13)],
    ['week4', 'Active in week 4', (p) => activeIn(p, 21, 27)]
  ];
  let survivors = cohort;
  const base = cohort.length;
  const out = [];
  for (const [key, label, test] of steps) {
    const prevCount = survivors.length;
    survivors = survivors.filter(test);
    out.push({ key, label, count: survivors.length, pct_of_start: pct(survivors.length, base), pct_of_previous: pct(survivors.length, prevCount) });
  }

  const today = usageDay(now);
  const mondayOf = (day) => {
    const d = new Date(`${day}T12:00:00Z`);
    return addDays(day, -((d.getUTCDay() + 6) % 7));
  };
  const weeks = new Map();
  for (const p of profiles) {
    if (!p.created_at || (filters.plan !== 'all' && (p.plan || 'free') !== filters.plan)) continue;
    const signup = usageDay(new Date(p.created_at));
    if (signup < addDays(mondayOf(range.toDay), -7 * 11) || signup > range.toDay) continue;
    const week = mondayOf(signup);
    if (!weeks.has(week)) weeks.set(week, []);
    weeks.get(week).push(p);
  }
  const cohorts = [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, members]) => {
      const cells = [];
      for (let k = 0; k < 8; k += 1) {
        if (addDays(week, 7 * k) > today) break;
        const eligible = members.filter((p) => addDays(usageDay(new Date(p.created_at)), 7 * k) <= today);
        const active = eligible.filter((p) => activeIn(p, 7 * k, 7 * k + 6)).length;
        cells.push(eligible.length ? pct(active, eligible.length) : null);
      }
      return { week, size: members.length, retention: cells };
    });
  return { cohort_size: base, steps: out, cohorts, note: 'Cohort: users who started signup in the selected range. Active = sent a text or web message, or ran a backtest.' };
}

async function alerts(ctx) {
  const { range, filters, match, profilesById } = ctx;
  await ensureFreshRollups({ now: ctx.now, fromDay: ctx.range.prevFromDay });
  const [rollups, alertDocs, deliveries, prevDeliveries] = await Promise.all([
    queryRollups({ from: range.prevFromDay, to: range.toDay }),
    queryAlerts({ from: range.start, to: range.end }),
    queryDeliveries({ from: range.start, to: range.end }),
    queryDeliveries({ from: range.prevStart, to: range.prevEnd })
  ]);
  const signalMatch = (a) => !filters.ticker || a.ticker === filters.ticker;
  const deliveryMatch = (d) => match(d, { channelField: d.status === 'suppressed' || d.status === 'queued_digest' ? null : 'channel' });
  const signals = alertDocs.filter(signalMatch);
  const dels = deliveries.filter(deliveryMatch);
  const prevDels = prevDeliveries.filter(deliveryMatch);
  const isSent = (d) => d.status === 'sent' || d.status === 'delivered';
  const sent = dels.filter(isSent);
  const suppressed = dels.filter((d) => d.status === 'suppressed');
  const cur = rollupTotals(rollups, range.fromDay, range.toDay, filters);
  const prev = rollupTotals(rollups, range.prevFromDay, range.prevToDay, filters);

  const reasons = new Map();
  for (const d of suppressed) reasons.set(d.suppression_reason || 'other', (reasons.get(d.suppression_reason || 'other') || 0) + 1);
  const latencyOf = (list) => list.map((d) => d.signal_to_text_ms ?? d.signal_to_send_ms).filter((n) => typeof n === 'number' && n >= 0);
  const latencies = latencyOf(sent);
  const prevLatencies = latencyOf(prevDels.filter(isSent));

  const tickerStats = new Map();
  for (const a of signals) tickerStats.set(a.ticker, { ticker: a.ticker, signals: 1 + (tickerStats.get(a.ticker)?.signals || 0), sent: tickerStats.get(a.ticker)?.sent || 0 });
  for (const d of sent) {
    const row = tickerStats.get(d.ticker) || { ticker: d.ticker, signals: 0, sent: 0 };
    row.sent += 1;
    tickerStats.set(d.ticker, row);
  }

  const within24h = (d, field) => d[field] && d.sent_at && new Date(d[field]) - new Date(d.sent_at) <= 86400000;
  const engagementFor = (list) => ({
    sent: list.length,
    reply_1h_pct: pct(list.filter((d) => d.replied_at).length, list.length),
    click_pct: pct(list.filter((d) => d.clicked_at).length, list.length),
    backtest_pct: pct(list.filter((d) => d.backtest_at).length, list.length),
    mute_or_opt_out_24h_pct: pct(list.filter((d) => within24h(d, 'muted_after_at') || within24h(d, 'opted_out_after_at')).length, list.length)
  });
  const engagement = engagementFor(sent);
  const prevEngagement = engagementFor(prevDels.filter(isSent));

  const byVersion = new Map();
  for (const a of signals.filter((x) => x.status !== 'retracted')) {
    const v = a.backend_param_version || 'unversioned';
    if (!byVersion.has(v)) byVersion.set(v, []);
    byVersion.get(v).push(a);
  }
  const quality = [...byVersion.entries()].map(([version, list]) => {
    const t1 = list.map((a) => a.forward_returns?.t1d?.return_pct).filter((n) => typeof n === 'number');
    const t5 = list.map((a) => a.forward_returns?.t5d?.return_pct).filter((n) => typeof n === 'number');
    const avg = (arr) => (arr.length ? round(sum(arr, (x) => x) / arr.length, 2) : null);
    return {
      version,
      signals: list.length,
      t1d_n: t1.length,
      t1d_avg: avg(t1),
      t1d_median: percentile(t1, 50),
      t1d_positive_pct: pct(t1.filter((x) => x > 0).length, t1.length),
      t5d_n: t5.length,
      t5d_avg: avg(t5),
      t5d_median: percentile(t5, 50),
      t5d_positive_pct: pct(t5.filter((x) => x > 0).length, t5.length)
    };
  });

  const delsByAlert = new Map();
  for (const d of deliveries) {
    if (filters.plan !== 'all' && (profilesById.get(d.user_id)?.plan || 'free') !== filters.plan) continue;
    if (!delsByAlert.has(d.alert_id)) delsByAlert.set(d.alert_id, []);
    delsByAlert.get(d.alert_id).push(d);
  }
  const recent = signals
    .sort((a, b) => (a.received_at < b.received_at ? 1 : -1))
    .slice(0, 100)
    .map((a) => {
      const list = delsByAlert.get(a.id) || [];
      const s = list.filter(isSent);
      return {
        id: a.id,
        ticker: a.ticker,
        signal_date: a.signal_date,
        signal_at: a.signal_at,
        received_at: a.received_at,
        status: a.status,
        version: a.backend_param_version || null,
        notional: a.signal_payload?.dark_pool_value ?? null,
        volume_ratio: a.signal_payload?.volume_ratio ?? null,
        recipients: list.length,
        sent: s.length,
        suppressed: list.filter((d) => d.status === 'suppressed').length,
        replied: s.filter((d) => d.replied_at).length,
        clicked: s.filter((d) => d.clicked_at).length,
        backtests: s.filter((d) => d.backtest_at).length,
        t1d: a.forward_returns?.t1d?.return_pct ?? null,
        t5d: a.forward_returns?.t5d?.return_pct ?? null
      };
    });

  return {
    totals: {
      signals: { value: cur.signals_received || 0, previous: prev.signals_received || 0, delta: deltaPct(cur.signals_received || 0, prev.signals_received || 0) },
      sent: { value: cur.alerts_sent || 0, previous: prev.alerts_sent || 0, delta: deltaPct(cur.alerts_sent || 0, prev.alerts_sent || 0) },
      suppressed: { value: cur.alerts_suppressed || 0, previous: prev.alerts_suppressed || 0, delta: deltaPct(cur.alerts_suppressed || 0, prev.alerts_suppressed || 0) },
      queued_digest: dels.filter((d) => d.status === 'queued_digest').length,
      failed: dels.filter((d) => d.status === 'failed').length,
      failed_previous: prevDels.filter((d) => d.status === 'failed').length,
      dry_run_sent: sent.filter((d) => d.dry_run).length
    },
    suppression: [...reasons.entries()].map(([reason, count]) => ({ reason, count, pct: pct(count, suppressed.length) })).sort((a, b) => b.count - a.count),
    latency: {
      p50_ms: percentile(latencies, 50),
      p95_ms: percentile(latencies, 95),
      samples: latencies.length,
      previous: { p50_ms: percentile(prevLatencies, 50), p95_ms: percentile(prevLatencies, 95) }
    },
    top_tickers: [...tickerStats.values()].sort((a, b) => b.sent - a.sent || b.signals - a.signals).slice(0, 15),
    engagement: { ...engagement, previous: prevEngagement },
    quality,
    recent,
    series: rollupSeries(rollups, range, filters, ['signals_received', 'alerts_sent', 'alerts_suppressed'])
  };
}

async function backtests(ctx) {
  const { range, filters, match } = ctx;
  await ensureFreshRollups({ now: ctx.now, fromDay: ctx.range.prevFromDay });
  const [rollups, jobs, prevJobs] = await Promise.all([
    queryRollups({ from: range.fromDay, to: range.toDay }),
    queryBacktests({ from: range.start, to: range.end }),
    queryBacktests({ from: range.prevStart, to: range.prevEnd })
  ]);
  const ok = (j) => match({ ...j, channel: j.notify?.channel || null });
  const list = jobs.filter(ok);
  const prevList = prevJobs.filter(ok);
  const stats = (arr) => {
    const done = arr.filter((j) => j.status === 'completed');
    const failed = arr.filter((j) => j.status === 'failed');
    const finished = done.length + failed.length;
    const runtimes = arr.map((j) => j.runtime_ms).filter((n) => n > 0);
    return { runs: arr.length, completed: done.length, failed: failed.length, success_rate: pct(done.length, finished), failure_rate: pct(failed.length, finished), median_runtime_ms: percentile(runtimes, 50), p95_runtime_ms: percentile(runtimes, 95) };
  };
  const cur = stats(list);
  const prev = stats(prevList);
  const structures = new Map();
  for (const j of list) {
    for (const s of j.structures || []) structures.set(s, { structure: s, tested: (structures.get(s)?.tested || 0) + 1, ranked_first: structures.get(s)?.ranked_first || 0 });
    if (j.winner) structures.set(j.winner, { ...structures.get(j.winner), ranked_first: (structures.get(j.winner)?.ranked_first || 0) + 1 });
  }
  const tickers = new Map();
  for (const j of list) tickers.set(j.ticker, (tickers.get(j.ticker) || 0) + 1);
  const sources = new Map();
  for (const j of list) sources.set(j.source, (sources.get(j.source) || 0) + 1);
  const results = list.filter((j) => j.status === 'completed').flatMap((j) => j.results || []);
  return {
    totals: { ...cur, previous: prev, deltas: { runs: deltaPct(cur.runs, prev.runs), success_rate: deltaPct(cur.success_rate, prev.success_rate), median_runtime_ms: deltaPct(cur.median_runtime_ms, prev.median_runtime_ms) } },
    series: rollupSeries(rollups, range, filters, ['backtests_requested', 'backtests_completed', 'backtests_failed']),
    structures: [...structures.values()].sort((a, b) => b.tested - a.tested),
    tickers: [...tickers.entries()].map(([ticker, runs]) => ({ ticker, runs })).sort((a, b) => b.runs - a.runs).slice(0, 15),
    sources: ['alert', 'free_form', 'web'].map((source) => ({ source, runs: sources.get(source) || 0 })),
    distributions: {
      sharpe: histogram(results.map((r) => r.sharpe), [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3]),
      win_rate: histogram(results.map((r) => r.win_rate), [0, 20, 40, 50, 60, 80, 100]),
      avg_return: histogram(results.map((r) => r.avg_return), [-100, -50, -25, 0, 25, 50, 100, 300])
    },
    recent: list.slice(0, 100).map((j) => ({
      id: j.id,
      user_id: j.user_id,
      ticker: j.ticker,
      source: j.source,
      status: j.status,
      winner: j.winner || null,
      sharpe: j.summary_metrics?.sharpe ?? null,
      win_rate: j.summary_metrics?.win_rate ?? null,
      runtime_ms: j.runtime_ms || null,
      error: j.error || null,
      created_at: j.created_at
    }))
  };
}

async function conversations(ctx) {
  const { range, match, profilesById } = ctx;
  const [msgs, toolCalls, events, flagged, prevMsgs, prevEvents] = await Promise.all([
    queryMessages({ from: range.start, to: range.end }),
    queryToolCalls({ from: range.start, to: range.end }),
    queryEvents({ from: range.start, to: range.end, types: ['feedback_given'] }),
    queryFlaggedConversations(),
    queryMessages({ from: range.prevStart, to: range.prevEnd }),
    queryEvents({ from: range.prevStart, to: range.prevEnd, types: ['feedback_given'] })
  ]);
  const allInbound = msgs.filter((m) => m.direction === 'inbound' && m.user_id && match(m, { tickerField: null, textField: 'body' }));
  const inbound = allInbound.filter((m) => INTENTS.includes(m.intent || 'other'));
  const preAgent = new Map();
  for (const m of allInbound.filter((x) => !INTENTS.includes(x.intent || 'other'))) preAgent.set(m.intent, (preAgent.get(m.intent) || 0) + 1);
  const intents = new Map(INTENTS.map((i) => [i, 0]));
  for (const m of inbound) intents.set(m.intent || 'other', (intents.get(m.intent || 'other') || 0) + 1);
  const tools = new Map();
  for (const t of toolCalls.filter((t) => match(t, { tickerField: null }))) {
    const row = tools.get(t.tool) || { tool: t.tool, calls: 0, errors: 0, latencies: [] };
    row.calls += 1;
    if (!t.success) row.errors += 1;
    row.latencies.push(t.latency_ms);
    tools.set(t.tool, row);
  }
  const replyStats = (list) => {
    const replies = list.filter((m) => m.direction === 'outbound' && m.kind === 'reply' && match(m, { tickerField: null, textField: 'body' }));
    const fallbacks = replies.filter((m) => m.fallback).length;
    return { replies: replies.length, fallbacks, rate: pct(fallbacks, replies.length) };
  };
  const positivePct = (list) => {
    const up = list.filter((e) => e.properties?.rating === 'up').length;
    return pct(up, up + list.filter((e) => e.properties?.rating === 'down').length);
  };
  const feedback = events.filter((e) => match(e, { tickerField: null }));
  const up = feedback.filter((e) => e.properties?.rating === 'up').length;
  const down = feedback.filter((e) => e.properties?.rating === 'down').length;
  return {
    inbound_total: inbound.length,
    intents: [...intents.entries()].map(([intent, count]) => ({ intent, count, pct: pct(count, inbound.length) })).sort((a, b) => b.count - a.count),
    handled_before_agent: [...preAgent.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
    tools: [...tools.values()]
      .map(({ latencies, ...t }) => ({ ...t, error_rate: pct(t.errors, t.calls), p50_ms: percentile(latencies, 50) }))
      .sort((a, b) => b.calls - a.calls),
    fallback: { ...replyStats(msgs), previous: replyStats(prevMsgs) },
    feedback: {
      up,
      down,
      positive_pct: pct(up, up + down),
      previous_positive_pct: positivePct(prevEvents.filter((e) => match(e, { tickerField: null }))),
      recent: feedback.slice(-20).reverse().map((e) => ({ user_id: e.user_id, rating: e.properties?.rating, comment: e.properties?.comment || null, message_id: e.properties?.message_id, at: e.created_at }))
    },
    flagged: flagged
      .filter((c) => !ctx.filters.plan || ctx.filters.plan === 'all' || (profilesById.get(c.user_id)?.plan || 'free') === ctx.filters.plan)
      .sort((a, b) => (a.flagged_at < b.flagged_at ? 1 : -1))
      .map((c) => ({
        user_id: c.user_id,
        phone_masked: profilesById.get(c.user_id)?.phone_masked || null,
        reasons: c.flag_reasons || [],
        last_reason: c.last_flag?.reason || null,
        message_id: c.last_flag?.message_id || null,
        flagged_at: c.flagged_at,
        message_count: c.message_count || 0
      }))
  };
}

async function users(ctx) {
  const { range, filters, profiles, match } = ctx;
  const [msgs, deliveries, jobs, events] = await Promise.all([
    queryMessages({ from: range.start, to: range.end }),
    queryDeliveries({ from: range.start, to: range.end }),
    queryBacktests({ from: range.start, to: range.end }),
    queryEvents({ from: range.start, to: range.end, types: ['llm_call', 'message_outbound'] })
  ]);
  const count = (arr, uid) => arr.filter((x) => x.user_id === uid).length;
  const cost = new Map();
  for (const e of events) {
    if (!e.user_id) continue;
    const v = e.type === 'llm_call' ? e.properties?.cost_usd || 0 : e.properties?.messaging_cost_usd || 0;
    cost.set(e.user_id, (cost.get(e.user_id) || 0) + v);
  }
  const msgsF = msgs.filter((m) => match(m, { tickerField: null, textField: 'body' }));
  const sent = deliveries.filter((d) => (d.status === 'sent' || d.status === 'delivered') && match(d));
  const jobsF = jobs.filter((j) => match({ ...j, channel: j.notify?.channel || null }));
  return {
    users: profiles
      .filter((p) => filters.plan === 'all' || (p.plan || 'free') === filters.plan)
      .map((p) => ({
        user_id: p.user_id,
        email: p.email || null,
        phone_masked: p.phone_masked || null,
        plan: p.plan || 'free',
        signup_at: p.created_at || null,
        verified: Boolean(p.phone_verified_at && p.consent_at),
        opted_out: Boolean(p.opted_out_at),
        paused: Boolean(p.paused_until && new Date(p.paused_until) > ctx.now),
        last_active_at: p.last_active_at || null,
        messages: count(msgsF, p.user_id),
        alerts_received: count(sent, p.user_id),
        backtests: count(jobsF, p.user_id),
        cost_usd: round(cost.get(p.user_id) || 0, 4)
      }))
      .sort((a, b) => String(b.last_active_at || b.signup_at || '').localeCompare(String(a.last_active_at || a.signup_at || '')))
  };
}

async function health(ctx) {
  const { range, filters } = ctx;
  await ensureFreshRollups({ now: ctx.now, fromDay: ctx.range.prevFromDay });
  const healthTypes = ['webhook_rejected', 'llm_call', 'llm_error', 'llm_timeout', 'agent_error', 'agent_timeout'];
  const [system, queue, rollups, events, msgs, jobs, prevEvents] = await Promise.all([
    getSystemState(),
    queueStats(),
    queryRollups({ from: range.fromDay, to: range.toDay }),
    queryEvents({ from: range.start, to: range.end }),
    queryMessages({ from: range.start, to: range.end }),
    queryBacktests({ from: range.start, to: range.end }),
    queryEvents({ from: range.prevStart, to: range.prevEnd, types: healthTypes })
  ]);
  const ofType = (...types) => events.filter((e) => types.includes(e.type));
  const errorCounts = (list) => {
    const n = (...types) => list.filter((e) => types.includes(e.type)).length;
    const failures = n('llm_error', 'llm_timeout');
    return { webhook_rejected: n('webhook_rejected'), llm_failures: failures, llm_error_rate: pct(failures, n('llm_call') + failures), agent_errors: n('agent_error', 'agent_timeout') };
  };
  const sendFailures = new Map();
  for (const e of ofType('send_failed')) {
    const key = `${e.properties?.provider || 'unknown'}|${e.properties?.error_code || 'unknown'}`;
    sendFailures.set(key, (sendFailures.get(key) || 0) + 1);
  }
  const llmCalls = ofType('llm_call');
  const llmLatency = llmCalls.map((e) => e.properties?.latency_ms);
  const replyLatency = msgs.filter((m) => m.direction === 'outbound' && m.kind === 'reply' && m.latency_ms > 0).map((m) => m.latency_ms);
  const perUser = new Map();
  for (const e of [...llmCalls, ...ofType('message_outbound')]) {
    if (!e.user_id) continue;
    const row = perUser.get(e.user_id) || { user_id: e.user_id, llm_cost_usd: 0, messaging_cost_usd: 0, tokens: 0 };
    if (e.type === 'llm_call') {
      row.llm_cost_usd += e.properties?.cost_usd || 0;
      row.tokens += (e.properties?.tokens_in || 0) + (e.properties?.tokens_out || 0);
    } else row.messaging_cost_usd += e.properties?.messaging_cost_usd || 0;
    perUser.set(e.user_id, row);
  }
  const totals = rollupTotals(rollups, range.fromDay, range.toDay, filters);
  return {
    switches: system,
    store: describeDb(),
    queue,
    last_tick_at: system.last_tick_at,
    last_tick: system.last_tick,
    last_rollup_at: system.last_rollup_at,
    webhooks: { received: ofType('webhook_received').length, rejected: ofType('webhook_rejected').length, rejected_recent: ofType('webhook_rejected').slice(-10).reverse().map((e) => ({ at: e.created_at, ...e.properties })) },
    send_failures: [...sendFailures.entries()].map(([k, count]) => ({ provider: k.split('|')[0], error_code: k.split('|')[1], count })).sort((a, b) => b.count - a.count),
    llm: {
      calls: llmCalls.length,
      errors: ofType('llm_error').length,
      timeouts: ofType('llm_timeout').length,
      error_rate: pct(ofType('llm_error', 'llm_timeout').length, llmCalls.length + ofType('llm_error', 'llm_timeout').length),
      p50_ms: percentile(llmLatency, 50),
      p95_ms: percentile(llmLatency, 95),
      agent_errors: ofType('agent_error', 'agent_timeout').length
    },
    previous: errorCounts(prevEvents),
    latency: {
      reply_p50_ms: percentile(replyLatency, 50),
      reply_p95_ms: percentile(replyLatency, 95),
      reply_p99_ms: percentile(replyLatency, 99),
      backtest_p50_ms: percentile(jobs.map((j) => j.runtime_ms), 50),
      backtest_p95_ms: percentile(jobs.map((j) => j.runtime_ms), 95)
    },
    cost: {
      totals: { llm_cost_usd: round(totals.llm_cost_usd || 0, 4), messaging_cost_usd: round(totals.messaging_cost_usd || 0, 4), tokens: totals.tokens || 0 },
      series: rollupSeries(rollups, range, filters, ['llm_cost_usd', 'messaging_cost_usd', 'tokens', 'llm_errors', 'send_failures']),
      per_user: [...perUser.values()]
        .map((r) => ({ ...r, phone_masked: ctx.profilesById.get(r.user_id)?.phone_masked || null, total_usd: round(r.llm_cost_usd + r.messaging_cost_usd, 4), llm_cost_usd: round(r.llm_cost_usd, 4), messaging_cost_usd: round(r.messaging_cost_usd, 4) }))
        .sort((a, b) => b.total_usd - a.total_usd)
        .slice(0, 25),
      spend_alert_threshold_usd: KIMI_CONFIG.agent.globalDailySpendAlertUsd,
      spend_alerts: ofType('global_spend_alert').map((e) => ({ at: e.created_at, ...e.properties }))
    },
    audit: (await queryAudit({ limit: 20 })).map((a) => ({ at: a.created_at, actor: a.actor_email, action: a.action, target_user_id: a.target_user_id }))
  };
}

const TABS = { overview, funnel, alerts, backtests, conversations, users, health };

export async function getDashboard({ tab = 'overview', ...params }) {
  const fn = TABS[tab];
  if (!fn) throw Object.assign(new Error(`Unknown tab: ${tab}`), { status: 400 });
  const ctx = await loadContext(params);
  const data = await fn(ctx);
  return { tab, range: ctx.range, filters: ctx.filters, generated_at: clockNow().toISOString(), data };
}
