// Kimi's alert engine: backend signals -> texts.
//
// A deterministic delivery worker. It does no signal detection: it never
// scores prints, checks price reaction or applies a signal threshold. Every
// alert is one backend signal, keyed on the backend's signal id and stored
// with the unmodified payload.
//
//   1. Consume: poll the backend's published signals; process each id once.
//   2. Late or corrected: honor revisions and retractions; skip signals older
//      than KIMI_MAX_SIGNAL_AGE_MINUTES (suppressed as `stale`).
//   3. Fan out to users whose watchlist covers the ticker or sector, then
//      apply in order: min notional (personal filter), paused, opted out,
//      quiet hours, market-hours-only, same-ticker dedupe, caps, digest.
//      Every suppression is recorded with a reason code.
//   4. Compose from the config template using only payload fields.
//   5. Make the alert the user's thread context (MORE / BT / mute resolve to it).
//   6. Record T+1d / T+5d forward returns from the backend's price data.

import { KIMI_CONFIG } from './kimi.config.js';
import { backend, signalIdOf } from './backend.js';
import { addDays, formatInTimeZone, localParts, parseHhMm, startOfLocalDay, clockNow } from './runtime.js';
import { sha256Hex } from './crypto.js';
import { sendKimiMessage } from './messaging/index.js';
import {
  createAlert,
  createDelivery,
  createShortLink,
  deliveryKey,
  emitEvent,
  getAlert,
  getDelivery,
  getProfile,
  getSystemState,
  getTickerMeta,
  listProfiles,
  profilePhone,
  queryAlerts,
  queryDeliveries,
  setTickerMeta,
  updateAlert,
  updateDelivery,
  updateProfile,
  withDefaultPreferences
} from './store.js';

const DELIVERY = KIMI_CONFIG.delivery;
const ACTIVE_DELIVERY = new Set(['sent', 'delivered', 'queued_digest', 'sending']);

// ---------------------------------------------------------------------------
// Template rendering: optional [segments] drop when a placeholder is missing
// ---------------------------------------------------------------------------

function compactUsd(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(v >= 1e10 ? 0 : 1)}B`;
  if (v >= 1e6) return `$${Math.round(v / 1e6)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}

function compactShares(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M sh`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}K sh`;
  return `${Math.round(v)} sh`;
}

function shortDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(v || ''))) return null;
  return new Date(`${String(v).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const FORMATTERS = {
  ticker: (v) => (v ? `$${String(v).toUpperCase()}` : null),
  shares: (v) => compactShares(num(v)),
  notional: (v) => compactUsd(num(v)),
  printTime: (v, ctx) => {
    const t = Date.parse(v);
    if (Number.isFinite(t) && /T/.test(String(v))) return formatInTimeZone(new Date(t), ctx.timezone, { hour: 'numeric', minute: '2-digit' });
    return /^\d{1,2}:\d{2}/.test(String(v)) ? String(v) : null;
  },
  date: shortDate,
  avgPrice: (v) => (num(v) > 0 ? `$${v.toFixed(2)}` : null),
  volumeRatio: (v) => (num(v) > 0 ? `${v.toFixed(1)}x` : null),
  reactionPct: (v) => (num(v) !== null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : null),
  reactionWindow: (v) => (num(v) > 0 ? String(Math.round(v)) : null),
  normalMovePct: (v) => (num(v) > 0 ? `${v.toFixed(1)}%` : null),
  structure: (v) => ({ call: 'long call', put: 'long put', straddle: 'ATM straddle' }[v] || null),
  strike: (v) => (num(v) > 0 ? `$${Number.isInteger(v) ? v : v.toFixed(2)}` : null),
  expiration: shortDate,
  entryPremium: (v) => (num(v) > 0 ? `$${v.toFixed(2)}` : null),
  hitRate: (v) => (num(v) > 0 ? `${Math.round(v)}%` : null),
  samples: (v) => (num(v) > 0 ? String(Math.round(v)) : null)
};

function parseTemplate(src) {
  let i = 0;
  const parseSeq = (closing) => {
    const nodes = [];
    let text = '';
    const flush = () => {
      if (text) nodes.push({ type: 'text', value: text });
      text = '';
    };
    while (i < src.length) {
      const ch = src[i];
      if (closing && ch === closing) {
        i += 1;
        break;
      }
      if (ch === '[') {
        flush();
        i += 1;
        nodes.push({ type: 'optional', children: parseSeq(']') });
      } else if (ch === '{') {
        flush();
        const end = src.indexOf('}', i);
        nodes.push({ type: 'var', name: src.slice(i + 1, end) });
        i = end + 1;
      } else {
        text += ch;
        i += 1;
      }
    }
    flush();
    return nodes;
  };
  return parseSeq(null);
}

function renderNodes(nodes, values) {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') out += node.value;
    else if (node.type === 'var') {
      const v = values[node.name];
      if (v === null || v === undefined || v === '') return null;
      out += v;
    } else {
      const inner = renderNodes(node.children, values);
      if (inner !== null) out += inner;
    }
  }
  return out;
}

let parsedTemplate = null;
let parsedSource = null;

/** Render the alert text from backend payload fields only. Null if ticker is missing. */
export function renderAlertText(signal, { link = null, timezone = DELIVERY.defaultTimezone, template = null } = {}) {
  const tpl = template || KIMI_CONFIG.alertTemplate;
  if (parsedSource !== tpl.text) {
    parsedTemplate = parseTemplate(tpl.text);
    parsedSource = tpl.text;
  }
  const values = { link: link || null };
  for (const [name, fields] of Object.entries(tpl.fields)) {
    const raw = fields.map((f) => signal?.[f]).find((v) => v !== undefined && v !== null && v !== '');
    values[name] = raw === undefined ? null : FORMATTERS[name] ? FORMATTERS[name](raw, { timezone }) : String(raw);
  }
  const text = renderNodes(parsedTemplate, values);
  return text ? text.replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim() : null;
}

export function renderDigestText(items, { link = null } = {}) {
  const lines = items.map((s) => [FORMATTERS.ticker(s.ticker), FORMATTERS.notional(s.dark_pool_value), FORMATTERS.volumeRatio(s.volume_ratio)].filter(Boolean).join(' '));
  return KIMI_CONFIG.templates.digest({ count: items.length, items: lines.join('; '), link });
}

// ---------------------------------------------------------------------------
// Delivery gates (pure)
// ---------------------------------------------------------------------------

export function isQuietHours(now, quietHours, timeZone) {
  if (!quietHours?.enabled) return false;
  const start = parseHhMm(quietHours.start);
  const end = parseHhMm(quietHours.end);
  if (start === null || end === null || start === end) return false;
  const { minutesOfDay } = localParts(now, timeZone);
  return start < end ? minutesOfDay >= start && minutesOfDay < end : minutesOfDay >= start || minutesOfDay < end;
}

export function isMarketHours(now) {
  const { timezone, open, close } = DELIVERY.marketHours;
  const parts = localParts(now, timezone);
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  if (DELIVERY.marketHolidays.includes(parts.date)) return false;
  return parts.minutesOfDay >= parseHhMm(open) && parts.minutesOfDay < parseHhMm(close);
}

export function watchlistMatch(prefs, signal, sector = null) {
  const ticker = String(signal.ticker || '').toUpperCase();
  const wl = prefs.watchlist || {};
  if ((wl.muted || []).includes(ticker)) return false;
  if (wl.mode !== 'custom') return true;
  if ((wl.tickers || []).includes(ticker)) return true;
  return Boolean(sector && (wl.sectors || []).includes(sector));
}

function needsSector(prefs, ticker) {
  const wl = prefs.watchlist || {};
  return wl.mode === 'custom' && (wl.sectors || []).length > 0 && !(wl.tickers || []).includes(ticker);
}

/**
 * Decide one user's delivery for one signal. `recent` are the user's deliveries
 * (any status) from the last ~30 hours.
 * Returns { eligible, reason?, capWindow?, digest? }.
 */
export function evaluateDelivery({ profile, signal, sector = null, recent = [], now = clockNow() }) {
  const prefs = withDefaultPreferences(profile.preferences);
  const ticker = String(signal.ticker || '').toUpperCase();

  if (!watchlistMatch(prefs, signal, sector)) return { eligible: false, reason: 'watchlist_miss' };
  const notional = signal.dark_pool_value ?? signal.notional;
  if (prefs.min_notional > 0 && typeof notional === 'number' && notional < prefs.min_notional) {
    return { eligible: false, reason: 'min_notional' };
  }
  if (profile.paused_until && new Date(profile.paused_until) > now) return { eligible: false, reason: 'paused' };
  if (profile.opted_out_at) return { eligible: false, reason: 'opted_out' };
  if (isQuietHours(now, prefs.quiet_hours, profile.timezone)) return { eligible: false, reason: 'quiet_hours' };
  if (prefs.market_hours_only && !isMarketHours(now)) return { eligible: false, reason: 'market_hours' };

  const counted = recent
    .filter((d) => ACTIVE_DELIVERY.has(d.status))
    .map((d) => ({ ...d, at: new Date(d.sent_at || d.created_at) }));
  const dedupeMs = DELIVERY.sameTickerDedupeMinutes * 60000;
  if (counted.some((d) => d.ticker === ticker && now - d.at < dedupeMs)) return { eligible: false, reason: 'dedupe' };

  const hourCap = prefs.max_alerts_per_hour || DELIVERY.defaultMaxAlertsPerHour;
  if (counted.filter((d) => now - d.at < 3600000).length >= hourCap) return { eligible: false, reason: 'cap', capWindow: 'hour' };
  const dayStart = startOfLocalDay(localParts(now, profile.timezone).date, profile.timezone);
  const dayCap = prefs.max_alerts_per_day || DELIVERY.defaultMaxAlertsPerDay;
  if (counted.filter((d) => d.at >= dayStart).length >= dayCap) return { eligible: false, reason: 'cap', capWindow: 'day' };

  if (prefs.digest?.enabled) return { eligible: true, digest: true, intervalMinutes: prefs.digest.interval_minutes };
  return { eligible: true, digest: false };
}

// ---------------------------------------------------------------------------
// Consumption and fan-out
// ---------------------------------------------------------------------------

async function sectorFor(ticker) {
  const cached = await getTickerMeta(ticker);
  if (cached && new Date(cached.fetched_at) > new Date(clockNow().getTime() - 30 * 86400000)) return cached.sector || null;
  const fetched = await backend().getTickerSector(ticker).catch(() => null);
  if (fetched) await setTickerMeta(ticker, fetched);
  return fetched?.sector || null;
}

async function suppress(alertId, userId, ticker, reason, { now, dryRun = false, capWindow = null } = {}) {
  const { created } = await createDelivery(alertId, userId, {
        ticker,
    status: 'suppressed',
    suppression_reason: reason,
    cap_window: capWindow,
    dry_run: dryRun,
    created_at: now.toISOString()
  });
  if (created) {
    await emitEvent('alert_suppressed', { userId, ticker, at: now, properties: { alert_id: alertId, reason, cap_window: capWindow } });
  }
  return created;
}

async function deliverNow({ alert, profile, now, provider, dryRun }) {
  const userId = profile.user_id;
  const claimed = await createDelivery(alert.id, userId, { ticker: alert.ticker, status: 'sending', dry_run: dryRun, created_at: now.toISOString() });
  if (!claimed.created) return null;
  const link = await createShortLink({
    targetPath: `/kimi/alerts/${encodeURIComponent(alert.id)}`,
    kind: 'alert',
    userId,
    alertId: alert.id,
    deliveryId: deliveryKey(alert.id, userId)
  });
  const text = renderAlertText(alert.signal_payload, { link: link.url, timezone: profile.timezone });
  const phone = profilePhone(profile);
  if (!text || !phone) {
    await updateDelivery(alert.id, userId, { status: 'failed', error_code: text ? 'NO_PHONE' : 'TEMPLATE_UNRENDERABLE' });
    return 'failed';
  }
  const res = await sendKimiMessage({ userId, to: phone, text, kind: 'alert', provider, relatedAlertId: alert.id, maxChars: 480, profile });
  const sentAt = clockNow();
  if (res.blocked) {
    await updateDelivery(alert.id, userId, { status: 'suppressed', suppression_reason: 'opted_out' });
    await emitEvent('alert_suppressed', { userId, ticker: alert.ticker, properties: { alert_id: alert.id, reason: 'opted_out' } });
    return 'suppressed';
  }
  if (res.failed) {
    const errorCode = res.results.find((r) => r.status === 'failed')?.errorCode || 'SEND_ERROR';
    await updateDelivery(alert.id, userId, { status: 'failed', error_code: errorCode, failed_at: sentAt.toISOString(), short_code: link.code });
    await emitEvent('alert_failed', { userId, ticker: alert.ticker, properties: { alert_id: alert.id, error_code: errorCode } });
    return 'failed';
  }
  const latencyMs = alert.signal_at ? sentAt - new Date(alert.signal_at) : null;
  await updateDelivery(alert.id, userId, {
    status: 'sent',
    dry_run: res.dryRun,
    sent_at: sentAt.toISOString(),
    channel: res.results[0]?.channel || null,
    provider_message_ids: res.results.map((r) => r.providerMessageId).filter(Boolean),
    message_ids: res.results.map((r) => r.messageId),
    short_code: link.code,
    signal_to_send_ms: latencyMs,
    ...(res.dryRun ? { delivered_at: sentAt.toISOString(), signal_to_text_ms: latencyMs } : {})
  });
  await updateProfile(userId, { last_alert_id: alert.id, last_alert_at: sentAt.toISOString() });
  await emitEvent('alert_sent', {
    userId,
    ticker: alert.ticker,
    channel: res.results[0]?.channel || null,
    at: sentAt,
    properties: { alert_id: alert.id, dry_run: res.dryRun, short_code: link.code, signal_to_send_ms: latencyMs, digest: false }
  });
  if (res.dryRun) {
    await emitEvent('alert_delivered', { userId, ticker: alert.ticker, at: sentAt, properties: { alert_id: alert.id, dry_run: true, signal_to_text_ms: latencyMs } });
  }
  return 'sent';
}

async function fanOut(alert, { now, provider }) {
  const sys = await getSystemState();
  const read = alert.signal_payload;
  const ticker = alert.ticker;
  const profiles = await listProfiles({ smsEnabledOnly: true });
  const recentAll = await queryDeliveries({ from: new Date(now.getTime() - 30 * 3600 * 1000).toISOString() });
  const recentByUser = new Map();
  for (const d of recentAll) {
    if (!recentByUser.has(d.user_id)) recentByUser.set(d.user_id, []);
    recentByUser.get(d.user_id).push(d);
  }
  let sector;
  const counts = { audience: 0, sent: 0, suppressed: 0, queued_digest: 0, failed: 0 };

  for (const profile of profiles) {
    const userId = profile.user_id;
    if (await getDelivery(alert.id, userId)) continue;
    const prefs = withDefaultPreferences(profile.preferences);
    if (needsSector(prefs, ticker) && sector === undefined) sector = await sectorFor(ticker);

    if (!sys.alerts_enabled) {
      if (watchlistMatch(prefs, read, sector || null)) {
        counts.audience += 1;
        if (await suppress(alert.id, userId, ticker, 'kill_switch', { now, dryRun: sys.dry_run })) counts.suppressed += 1;
      }
      continue;
    }

    const gate = evaluateDelivery({ profile, signal: read, sector: sector || null, recent: recentByUser.get(userId) || [], now });
    if (gate.reason !== 'watchlist_miss') counts.audience += 1;
    if (!gate.eligible) {
      if (await suppress(alert.id, userId, ticker, gate.reason, { now, dryRun: sys.dry_run, capWindow: gate.capWindow || null })) counts.suppressed += 1;
      continue;
    }
    if (gate.digest) {
      const open = (recentByUser.get(userId) || []).find((d) => d.status === 'queued_digest' && d.digest_due_at);
      const dueAt = open ? open.digest_due_at : new Date(now.getTime() + gate.intervalMinutes * 60000).toISOString();
      const { created } = await createDelivery(alert.id, userId, { ticker, status: 'queued_digest', digest_due_at: dueAt, dry_run: sys.dry_run, created_at: now.toISOString() });
      if (created) {
        counts.queued_digest += 1;
        await emitEvent('alert_queued_digest', { userId, ticker, at: now, properties: { alert_id: alert.id, due_at: dueAt } });
        const list = recentByUser.get(userId) || [];
        list.push({ alert_id: alert.id, ticker, status: 'queued_digest', digest_due_at: dueAt, created_at: now.toISOString() });
        recentByUser.set(userId, list);
      }
      continue;
    }
    const outcome = await deliverNow({ alert, profile, now, provider, dryRun: sys.dry_run });
    if (outcome === 'sent') {
      counts.sent += 1;
      const list = recentByUser.get(userId) || [];
      list.push({ alert_id: alert.id, ticker, status: 'sent', sent_at: clockNow().toISOString(), created_at: now.toISOString() });
      recentByUser.set(userId, list);
    } else if (outcome === 'suppressed') counts.suppressed += 1;
    else if (outcome === 'failed') counts.failed += 1;
  }

  await updateAlert(alert.id, {
    fanout_status: 'done',
    fanout_completed_at: clockNow().toISOString(),
    audience_count: counts.audience,
    sent_count: counts.sent,
    suppressed_count: counts.suppressed,
    queued_digest_count: counts.queued_digest,
    failed_count: counts.failed,
    kill_switch: !sys.alerts_enabled,
    dry_run: sys.dry_run
  });
  return counts;
}

async function suppressForSignal(alert, reason, now) {
  const profiles = await listProfiles({ smsEnabledOnly: true });
  let suppressed = 0;
  for (const profile of profiles) {
    if (profile.opted_out_at) continue;
    if (!watchlistMatch(withDefaultPreferences(profile.preferences), alert.signal_payload, null)) continue;
    if (await suppress(alert.id, profile.user_id, alert.ticker, reason, { now })) suppressed += 1;
  }
  await updateAlert(alert.id, { fanout_status: 'done', suppressed_count: suppressed, audience_count: suppressed, sent_count: 0 });
  return suppressed;
}

export async function retractAlert(alertId, { reason = 'retracted_by_backend', now = clockNow() } = {}) {
  const alert = await getAlert(alertId);
  if (!alert || alert.status === 'retracted') return false;
  await updateAlert(alertId, { status: 'retracted', previous_status: alert.status, retracted_at: now.toISOString(), retraction_reason: reason });
  const queued = await queryDeliveries({ alertId });
  for (const d of queued.filter((x) => x.status === 'queued_digest')) {
    await updateDelivery(alertId, d.user_id, { status: 'suppressed', suppression_reason: 'retracted' });
    await emitEvent('alert_suppressed', { userId: d.user_id, ticker: alert.ticker, at: now, properties: { alert_id: alertId, reason: 'retracted' } });
  }
  await emitEvent('signal_retracted', {
    ticker: alert.ticker,
    at: now,
    properties: { alert_id: alertId, reason, already_sent: alert.sent_count || 0, previous_status: alert.status }
  });
  return true;
}

/**
 * Consume one backend signal. Exactly once per signal id: a repeat delivery of
 * the same id never sends again (revisions and retractions are logged).
 */
export async function consumeSignal(read, { now = clockNow(), provider = null, paramVersion = null, feed = null, maxSignalAgeMinutes = null } = {}) {
  const id = signalIdOf(read);
  if (!id) throw new Error('Signal has no id (ticker + date)');
  const ticker = String(read.ticker).toUpperCase();
  const signalAt = read.found_at ? new Date(read.found_at).toISOString() : null;
  const ageMinutes = signalAt ? (now - new Date(signalAt)) / 60000 : null;
  const maxAge = maxSignalAgeMinutes ?? DELIVERY.maxSignalAgeMinutes;
  const retracted = read.retracted === true || String(read.status || '').toLowerCase() === 'retracted';
  const stale = !retracted && (ageMinutes === null || (maxAge > 0 && ageMinutes > maxAge));
  const status = retracted ? 'retracted' : stale ? 'stale' : 'active';
  const payloadHash = sha256Hex(JSON.stringify(read));

  const { created } = await createAlert(id, {
    ticker,
    signal_payload: read,
    backend_param_version: paramVersion || read.method || read.param_version || null,
    signal_at: signalAt,
    signal_date: read.date || null,
    received_at: now.toISOString(),
    status,
    stale_reason: stale ? (signalAt ? 'older_than_max_age' : 'missing_signal_time') : null,
    feed,
    payload_hash: payloadHash,
    revisions: [],
    fanout_status: status === 'active' ? 'pending' : 'skipped',
    fanout_started_at: now.toISOString(),
    forward_returns: null
  });

  if (!created) {
    const existing = await getAlert(id);
    if (existing.payload_hash !== payloadHash) {
      await updateAlert(id, {
        revisions: [...(existing.revisions || []), { at: now.toISOString(), previous_hash: existing.payload_hash, previous_payload: existing.signal_payload }].slice(-10),
        signal_payload: read,
        payload_hash: payloadHash,
        revised_at: now.toISOString()
      });
      await emitEvent('signal_revised', { ticker, at: now, properties: { alert_id: id } });
    }
    if (retracted && existing.status !== 'retracted') await retractAlert(id, { reason: 'retracted_flag', now });
    // Resume a fan-out that crashed part-way (per-user deliveries are idempotent).
    if (existing.status === 'active' && existing.fanout_status === 'pending' && now - new Date(existing.fanout_started_at) > 120000) {
      await updateAlert(id, { fanout_started_at: now.toISOString() });
      const counts = await fanOut({ ...existing, id }, { now, provider });
      return { id, ticker, status: 'active', alreadyProcessed: true, resumed: true, ...counts };
    }
    return { id, ticker, status: existing.status, alreadyProcessed: true };
  }

  await emitEvent('signal_received', {
    ticker,
    at: now,
    properties: { alert_id: id, status, age_minutes: ageMinutes === null ? null : Math.round(ageMinutes), backend_param_version: paramVersion || null, feed }
  });
  const alert = await getAlert(id);
  if (status !== 'active') {
    await emitEvent(status === 'stale' ? 'signal_stale' : 'signal_retracted', { ticker, at: now, properties: { alert_id: id, age_minutes: ageMinutes === null ? null : Math.round(ageMinutes) } });
    const recent = ageMinutes !== null && ageMinutes <= DELIVERY.backfillAgeDays * 1440;
    const suppressed = recent ? await suppressForSignal(alert, status, now) : 0;
    if (!recent) await updateAlert(id, { backfill: true });
    return { id, ticker, status, alreadyProcessed: false, sent: 0, suppressed, queued_digest: 0 };
  }
  const counts = await fanOut(alert, { now, provider });
  return { id, ticker, status, alreadyProcessed: false, ...counts };
}

/** Retract active alerts the backend no longer publishes. Guarded against partial feeds. */
export async function reconcileRetractions(feed, { now = clockNow() } = {}) {
  if (!feed?.historyOk) return { skipped: 'history feed unavailable' };
  const published = new Set(feed.signals.map((s) => s.id));
  const rejected = new Map((feed.rejected || []).map((r) => [r.id, r.reason]));
  const active = await queryAlerts({ status: 'active' });
  const since = feed.historySince || '0000-00-00';
  const generatedAt = feed.generatedAt ? new Date(feed.generatedAt) : null;
  const candidates = active.filter((a) => {
    if (rejected.has(a.id)) return true;
    if (published.has(a.id)) return false;
    return Boolean(generatedAt && a.signal_date >= since && generatedAt > new Date(a.received_at));
  });
  const limit = Math.max(3, Math.floor(active.length * DELIVERY.retractionGuardMaxFraction));
  if (candidates.length > limit) {
    await emitEvent('retraction_guard_tripped', { at: now, properties: { candidates: candidates.length, active: active.length } });
    return { skipped: 'guard', candidates: candidates.length };
  }
  let retracted = 0;
  for (const a of candidates) {
    if (await retractAlert(a.id, { reason: rejected.get(a.id) || 'removed_from_backend_feed', now })) retracted += 1;
  }
  return { retracted };
}

/** Poll the backend's published signals and consume new ones. */
export async function pollSignals({ now = clockNow(), provider = null } = {}) {
  const feed = await backend().loadPublishedSignals();
  if (!feed.ok) {
    await emitEvent('signal_feed_unavailable', { at: now });
    return { ok: false, reason: 'signal feed unavailable' };
  }
  const ordered = [...feed.signals].sort((a, b) => String(a.read.found_at || '').localeCompare(String(b.read.found_at || '')));
  const summary = { ok: true, source: feed.source, published: ordered.length, new: 0, active: 0, stale: 0, retracted: 0, sent: 0, suppressed: 0, queued_digest: 0, failed: 0 };
  for (const { read, feed: feedName } of ordered) {
    const res = await consumeSignal(read, { now, provider, paramVersion: feed.method, feed: feedName });
    if (res.alreadyProcessed && !res.resumed) continue;
    if (!res.alreadyProcessed) summary.new += 1;
    summary[res.status] = (summary[res.status] || 0) + 1;
    summary.sent += res.sent || 0;
    summary.suppressed += res.suppressed || 0;
    summary.queued_digest += res.queued_digest || 0;
    summary.failed += res.failed || 0;
  }
  summary.retractions = await reconcileRetractions(feed, { now });
  return summary;
}

// ---------------------------------------------------------------------------
// Digests
// ---------------------------------------------------------------------------

export async function flushDigests({ now = clockNow(), provider = null } = {}) {
  const queued = await queryDeliveries({ status: 'queued_digest' });
  const byUser = new Map();
  for (const d of queued) {
    if (!byUser.has(d.user_id)) byUser.set(d.user_id, []);
    byUser.get(d.user_id).push(d);
  }
  const sys = await getSystemState();
  const out = { users: 0, sent: 0, suppressed: 0 };

  for (const [userId, items] of byUser) {
    const dueAt = items.reduce((min, d) => (d.digest_due_at < min ? d.digest_due_at : min), items[0].digest_due_at);
    if (new Date(dueAt) > now) continue;
    const profile = await getProfile(userId);
    const alerts = await Promise.all(items.map((d) => getAlert(d.alert_id)));
    const live = [];
    for (let i = 0; i < items.length; i += 1) {
      const d = items[i];
      const alert = alerts[i];
      let reason = null;
      if (!alert || alert.status === 'retracted') reason = 'retracted';
      else if (!profile?.sms_enabled || profile.opted_out_at) reason = 'opted_out';
      else if (profile.paused_until && new Date(profile.paused_until) > now) reason = 'paused';
      else if (!sys.alerts_enabled) reason = 'kill_switch';
      if (reason) {
        await updateDelivery(d.alert_id, userId, { status: 'suppressed', suppression_reason: reason });
        await emitEvent('alert_suppressed', { userId, ticker: d.ticker, at: now, properties: { alert_id: d.alert_id, reason, digest: true } });
        out.suppressed += 1;
      } else live.push({ delivery: d, alert });
    }
    if (!live.length) continue;
    if (isQuietHours(now, withDefaultPreferences(profile.preferences).quiet_hours, profile.timezone)) continue;

    live.sort((a, b) => String(a.alert.signal_at).localeCompare(String(b.alert.signal_at)));
    const link = await createShortLink({ targetPath: '/kimi?tab=alerts', kind: 'alerts', userId });
    const text = renderDigestText(live.map((x) => x.alert.signal_payload), { link: link.url });
    const res = await sendKimiMessage({ userId, to: profilePhone(profile), text, kind: 'digest', provider, relatedAlertId: live[live.length - 1].alert.id, maxChars: 480, profile });
    const sentAt = clockNow().toISOString();
    for (const { delivery, alert } of live) {
      const failed = res.failed || res.blocked;
      await updateDelivery(delivery.alert_id, userId, {
        status: failed ? (res.blocked ? 'suppressed' : 'failed') : 'sent',
        suppression_reason: res.blocked ? 'opted_out' : null,
        digest: true,
        dry_run: res.dryRun,
        sent_at: failed ? null : sentAt,
        short_code: link.code,
        signal_to_send_ms: alert.signal_at ? new Date(sentAt) - new Date(alert.signal_at) : null,
        ...(res.dryRun && !failed ? { delivered_at: sentAt } : {})
      });
      if (!failed) {
        await emitEvent('alert_sent', { userId, ticker: alert.ticker, properties: { alert_id: alert.id, dry_run: res.dryRun, digest: true, short_code: link.code } });
        if (res.dryRun) await emitEvent('alert_delivered', { userId, ticker: alert.ticker, properties: { alert_id: alert.id, dry_run: true, digest: true } });
      }
    }
    if (!res.failed && !res.blocked) {
      const newest = live[live.length - 1].alert;
      await updateProfile(userId, { last_alert_id: newest.id, last_alert_at: sentAt });
      await emitEvent('digest_sent', { userId, properties: { count: live.length, dry_run: res.dryRun } });
      out.sent += live.length;
    }
    out.users += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Delivery receipts from provider status callbacks
// ---------------------------------------------------------------------------

export async function recordDeliveryReceipt({ messageId, userId, alertId, status, errorCode = null, at = clockNow() }) {
  await emitEvent(status === 'delivered' ? 'message_delivered' : status === 'failed' ? 'message_failed' : 'message_status', {
    userId,
    at,
    properties: { message_id: messageId, status, error_code: errorCode, alert_id: alertId || null }
  });
  if (!alertId || !userId) return;
  const delivery = await getDelivery(alertId, userId);
  if (!delivery) return;
  if (status === 'delivered' && !delivery.delivered_at) {
    const alert = await getAlert(alertId);
    const latency = alert?.signal_at ? at - new Date(alert.signal_at) : null;
    await updateDelivery(alertId, userId, { status: 'delivered', delivered_at: at.toISOString(), signal_to_text_ms: latency });
    await emitEvent('alert_delivered', { userId, ticker: delivery.ticker, at, properties: { alert_id: alertId, signal_to_text_ms: latency } });
  } else if (status === 'failed' && delivery.status !== 'delivered') {
    await updateDelivery(alertId, userId, { status: 'failed', error_code: errorCode, failed_at: at.toISOString() });
  }
}

// ---------------------------------------------------------------------------
// Signal quality: forward returns from the backend's daily closes
// ---------------------------------------------------------------------------

export async function updateForwardReturns({ now = clockNow(), limit = 40, lookbackDays = 30 } = {}) {
  const today = localParts(now, 'America/New_York').date;
  const earliest = addDays(today, -lookbackDays);
  const alerts = [...(await queryAlerts({ status: 'active' })), ...(await queryAlerts({ status: 'stale' }))]
    .filter((a) => a.signal_date && a.signal_date >= earliest && a.signal_date < today && !a.forward_returns?.t5d)
    .sort((a, b) => (a.signal_date < b.signal_date ? -1 : 1))
    .slice(0, limit);
  let updated = 0;
  for (const alert of alerts) {
    const bars = await backend().getDailyBars(alert.ticker, alert.signal_date, addDays(alert.signal_date, 12)).catch(() => []);
    const baseIdx = bars.findIndex((b) => b.date === alert.signal_date);
    if (baseIdx < 0 || !(bars[baseIdx].close > 0)) continue;
    const base = bars[baseIdx];
    const point = (offset) => {
      const bar = bars[baseIdx + offset];
      return bar ? { date: bar.date, close: bar.close, return_pct: Number((((bar.close - base.close) / base.close) * 100).toFixed(2)) } : null;
    };
    await updateAlert(alert.id, {
      forward_returns: { base_date: base.date, base_close: base.close, t1d: point(1), t5d: point(5), source: 'polygon daily closes (lib/polygon-data-service.js)', updated_at: now.toISOString() }
    });
    updated += 1;
  }
  return { updated, checked: alerts.length };
}
